import type { Context } from "hono";
import { decodeProtectedHeader, jwtVerify } from "jose";
import { isApiKeyAllowedScope } from "@/lib/scopes";
import type { AuthContext } from "@/types/auth";
import type { AppEnv } from "@/types/hono";

const ISSUER = "spontai-api";
const AUDIENCE = "spontai-api";

function jsonError(status: 401 | 403, code: string, description: string): Response {
  return new Response(JSON.stringify({ error: code, error_description: description }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getSigningKey(kid: string, env: AppEnv["Bindings"]): Uint8Array | null {
  const map: Record<string, string | undefined> = {
    v1: env.HMAC_SIGNING_SECRET,
  };
  const secret = map[kid];
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export async function verifyAuth(c: Context<AppEnv>): Promise<AuthContext | Response> {
  const header = c.req.header("authorization");
  if (!header) {
    return jsonError(401, "invalid_request", "Missing Authorization header");
  }

  const parts = header.split(" ");
  if (parts.length !== 2) {
    return jsonError(401, "invalid_request", "Malformed Authorization header");
  }
  const [scheme, token] = parts;
  if (!scheme || !token) {
    return jsonError(401, "invalid_request", "Malformed Authorization header");
  }

  const expectedKind: AuthContext["kind"] | null =
    scheme === "Bearer" ? "oauth_access" : scheme === "ApiKey" ? "api_key" : null;
  if (!expectedKind) {
    return jsonError(401, "invalid_request", `Unknown auth scheme: ${scheme}`);
  }

  let kid: string | undefined;
  try {
    const protectedHeader = decodeProtectedHeader(token);
    kid = protectedHeader.kid;
  } catch {
    return jsonError(401, "invalid_token", "Token header could not be decoded");
  }
  if (!kid) {
    return jsonError(401, "invalid_token", "Token missing kid header");
  }

  const key = getSigningKey(kid, c.env);
  if (!key) {
    return jsonError(401, "invalid_token", `Unknown kid: ${kid}`);
  }

  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, key, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    return jsonError(401, "invalid_token", "Token signature invalid or expired");
  }

  const kind = payload["kind"];
  if (kind !== expectedKind) {
    return jsonError(401, "invalid_token", "Token kind does not match auth scheme");
  }

  const sub = typeof payload["sub"] === "string" ? payload["sub"] : null;
  if (!sub) {
    return jsonError(401, "invalid_token", "Token missing sub claim");
  }

  const jti = typeof payload["jti"] === "string" ? payload["jti"] : "";
  const scopeStr = typeof payload["scope"] === "string" ? payload["scope"] : "";
  const scopes = scopeStr.length > 0 ? scopeStr.split(" ") : [];

  if (kind === "api_key") {
    for (const s of scopes) {
      if (!isApiKeyAllowedScope(s)) {
        return jsonError(401, "invalid_scope", `API key may not request scope: ${s}`);
      }
    }
    return { kind: "api_key", sub, scopes, jti };
  }

  const clientId = typeof payload["client_id"] === "string" ? payload["client_id"] : "";
  if (!clientId) {
    return jsonError(401, "invalid_token", "OAuth token missing client_id");
  }
  return { kind: "oauth_access", sub, scopes, jti, clientId };
}

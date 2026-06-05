// DEV/TEST ONLY — JWT minting helpers used by tests and local dev.
// Production code paths MUST NOT import this. Once Phase 5+ adds
// /oauth/token, real tokens will be minted there instead.

import { SignJWT } from "jose";

export const TEST_HMAC_SECRET = "phase2-test-secret-32-chars-min-length-!!";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

type Kind = "oauth_access" | "api_key";

export interface MintJwtOpts {
  kind: Kind;
  sub: string;
  scopes: string[];
  clientId?: string;
  expiresAtUnix?: number;
  expiresInSec?: number;
  iss?: string;
  aud?: string;
  secret?: string;
  kid?: string;
}

export async function mintTestJwt(opts: MintJwtOpts): Promise<string> {
  const secretStr = opts.secret ?? TEST_HMAC_SECRET;
  const exp = opts.expiresAtUnix ?? Math.floor(Date.now() / 1000) + (opts.expiresInSec ?? 900);

  const claims: Record<string, unknown> = {
    kind: opts.kind,
    scope: opts.scopes.join(" "),
  };
  if (opts.kind === "oauth_access") {
    claims["client_id"] = opts.clientId ?? "test_client_default";
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", kid: opts.kid ?? "v1", typ: "JWT" })
    .setIssuer(opts.iss ?? "spontai-api")
    .setAudience(opts.aud ?? "spontai-api")
    .setSubject(opts.sub)
    .setIssuedAt()
    .setExpirationTime(exp)
    .setJti(crypto.randomUUID())
    .sign(encode(secretStr));
}

export const mintTestAccessToken = (opts: Omit<MintJwtOpts, "kind">): Promise<string> =>
  mintTestJwt({ ...opts, kind: "oauth_access" });

export const mintTestApiKey = (opts: Omit<MintJwtOpts, "kind">): Promise<string> =>
  mintTestJwt({
    ...opts,
    kind: "api_key",
    expiresInSec: opts.expiresInSec ?? 365 * 24 * 60 * 60,
  });

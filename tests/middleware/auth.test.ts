import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { verifyAuth } from "../../src/middleware/auth";
import type { AppEnv } from "../../src/types/hono";
import { mintTestAccessToken, mintTestApiKey, mintTestJwt, testEnv } from "../_helpers/env";

function buildProbeApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get("/probe", async (c) => {
    const result = await verifyAuth(c);
    if (result instanceof Response) return result;
    return c.json({ ok: true, auth: result });
  });
  return app;
}

const env = testEnv();

describe("verifyAuth", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const res = await buildProbeApp().request("/probe", {}, env);
    expect(res.status).toBe(401);
  });

  it("returns 401 for Authorization header with no recognized scheme", async () => {
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: "notreal abc.def.ghi" } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for Bearer with non-JWT garbage", async () => {
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: "Bearer notajwt" } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for Bearer JWT signed with wrong secret", async () => {
    const token = await mintTestAccessToken({
      sub: "user_1",
      scopes: ["trips:read"],
      secret: "different-secret-32-chars-long-!!!!!!!!",
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for Bearer JWT with exp in the past", async () => {
    const token = await mintTestAccessToken({
      sub: "user_1",
      scopes: ["trips:read"],
      expiresAtUnix: Math.floor(Date.now() / 1000) - 60,
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for Bearer JWT with wrong iss", async () => {
    const token = await mintTestAccessToken({
      sub: "user_1",
      scopes: ["trips:read"],
      iss: "different-issuer",
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for Bearer JWT with kind=api_key (scheme/kind mismatch)", async () => {
    const token = await mintTestJwt({
      kind: "api_key",
      sub: "partner_acme",
      scopes: ["feed:read"],
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for ApiKey JWT with kind=oauth_access (scheme/kind mismatch)", async () => {
    const token = await mintTestJwt({
      kind: "oauth_access",
      sub: "user_1",
      scopes: ["trips:read"],
      clientId: "agent_foo",
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `ApiKey ${token}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("accepts a valid Bearer oauth_access token and populates auth context", async () => {
    const token = await mintTestAccessToken({
      sub: "user_42",
      clientId: "agent_summarizer",
      scopes: ["trips:read", "places:read"],
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; auth: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.auth.kind).toBe("oauth_access");
    expect(body.auth.sub).toBe("user_42");
    expect(body.auth.clientId).toBe("agent_summarizer");
    expect(body.auth.scopes).toEqual(["trips:read", "places:read"]);
  });

  it("accepts a valid ApiKey with feed:read scope", async () => {
    const token = await mintTestApiKey({
      sub: "partner_acme",
      scopes: ["feed:read"],
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `ApiKey ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; auth: Record<string, unknown> };
    expect(body.auth.kind).toBe("api_key");
    expect(body.auth.sub).toBe("partner_acme");
  });

  it("returns 401 for ApiKey requesting a non-allowlisted scope (trips:read)", async () => {
    const token = await mintTestApiKey({
      sub: "partner_acme",
      scopes: ["trips:read"],
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `ApiKey ${token}` } },
      env,
    );
    expect(res.status).toBe(401);
  });
});

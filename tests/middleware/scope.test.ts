import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { requireScope } from "../../src/middleware/scope";
import type { AppEnv } from "../../src/types/hono";
import { mintTestAccessToken, mintTestApiKey, testEnv } from "../_helpers/env";

function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get("/public", (c) => c.json({ ok: true }));
  app.get("/trips", requireScope("trips:read"), (c) => c.json({ ok: true, sub: c.var.auth!.sub }));
  app.get("/feed", requireScope("feed:read"), (c) => c.json({ ok: true, sub: c.var.auth!.sub }));
  return app;
}

const env = testEnv();

describe("requireScope", () => {
  it("returns 403 when token is valid but missing required scope", async () => {
    const token = await mintTestAccessToken({
      sub: "user_1",
      scopes: ["places:read"],
    });
    const res = await buildApp().request(
      "/trips",
      { headers: { authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("insufficient_scope");
  });

  it("returns 200 when token has the exact required scope", async () => {
    const token = await mintTestAccessToken({
      sub: "user_1",
      scopes: ["trips:read"],
    });
    const res = await buildApp().request(
      "/trips",
      { headers: { authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["sub"]).toBe("user_1");
  });

  it("returns 200 when token has the required scope among multiple scopes", async () => {
    const token = await mintTestApiKey({
      sub: "partner_acme",
      scopes: ["feed:read"],
    });
    const res = await buildApp().request(
      "/feed",
      { headers: { authorization: `ApiKey ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
  });

  it("returns 200 on a public route without any Authorization header", async () => {
    const res = await buildApp().request("/public", {}, env);
    expect(res.status).toBe(200);
  });
});

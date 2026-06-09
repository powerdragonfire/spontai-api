import { describe, expect, it } from "bun:test";
import { app } from "../../src/index";
import { testEnv } from "../_helpers/env";

const env = testEnv();

describe("GET /v1/health", () => {
  it("returns 200 without authentication (liveness probe)", async () => {
    const res = await app.request("/v1/health", {}, env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });
});

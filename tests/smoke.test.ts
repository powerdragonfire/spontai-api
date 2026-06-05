import { describe, expect, it } from "bun:test";
import { app } from "../src/index";
import { testEnv } from "./_helpers/env";

describe("smoke", () => {
  it("GET / returns 200 with ok:true payload", async () => {
    const res = await app.request("/", {}, testEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      ok: true,
      name: "spontai-api",
      version: "0.0.1",
    });
  });
});

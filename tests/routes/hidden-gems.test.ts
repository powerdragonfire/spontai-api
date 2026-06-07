import { describe, expect, it } from "bun:test";
import { app } from "../../src/index";
import { mintTestAccessToken, testEnv } from "../_helpers/env";

const env = testEnv();

async function authedGet(path: string, scopes: string[] = ["hidden_gems:read"]): Promise<Response> {
  const token = await mintTestAccessToken({ sub: "user_1", scopes });
  return app.request(path, { headers: { authorization: `Bearer ${token}` } }, env);
}

async function authedPost(
  path: string,
  body: unknown,
  scopes: string[] = ["hidden_gems:read"],
): Promise<Response> {
  const token = await mintTestAccessToken({ sub: "user_1", scopes });
  return app.request(
    path,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe("auth + scope", () => {
  it("401 without a token", async () => {
    const res = await app.request("/v1/hidden-gems/search?city=London", {}, env);
    expect(res.status).toBe(401);
  });

  it("403 with a token lacking hidden_gems:read", async () => {
    const res = await authedGet("/v1/hidden-gems/search?city=London", ["trips:read"]);
    expect(res.status).toBe(403);
  });
});

describe("GET /v1/hidden-gems/search", () => {
  it("returns ranked, explained results", async () => {
    const res = await authedGet("/v1/hidden-gems/search?city=London&limit=50");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results.length).toBeGreaterThan(0);

    const [first] = body.results;
    if (!first) throw new Error("expected at least one result");
    expect(first).toHaveProperty("placeId");
    expect(first).toHaveProperty("hiddenGemScore");
    expect(first).toHaveProperty("trendStage");
    expect(first).toHaveProperty("visitNowScore");
    expect(first).toHaveProperty("crowdRisk");
    expect(first).toHaveProperty("confidence");
    expect(Array.isArray(first.whyNow)).toBe(true);
    expect(first.evidence).toHaveProperty("socialVelocity");

    // sorted by hiddenGemScore descending
    const scores = body.results.map((r) => r.hiddenGemScore as number);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("suppresses saturated places by default", async () => {
    const res = await authedGet("/v1/hidden-gems/search?city=London&limit=50");
    const body = (await res.json()) as { results: Array<{ placeId: string; trendStage: string }> };
    expect(body.results.some((r) => r.trendStage === "saturated")).toBe(false);
    expect(body.results.some((r) => r.placeId === "lon_maltby_street")).toBe(false);
    expect(body.results.some((r) => r.placeId === "lon_sky_garden")).toBe(false);
  });

  it("can explicitly surface saturated places via trendStage filter", async () => {
    const res = await authedGet("/v1/hidden-gems/search?city=London&trendStage=saturated&limit=50");
    const body = (await res.json()) as { results: Array<{ trendStage: string }> };
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.every((r) => r.trendStage === "saturated")).toBe(true);
  });

  it("filters by category", async () => {
    const res = await authedGet("/v1/hidden-gems/search?city=London&category=cafe&limit=50");
    const body = (await res.json()) as { results: Array<{ category: string }> };
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.every((r) => r.category === "cafe")).toBe(true);
  });

  it("rejects an out-of-range lat with 400", async () => {
    const res = await authedGet("/v1/hidden-gems/search?city=London&lat=999");
    expect(res.status).toBe(400);
  });
});

describe("GET /v1/hidden-gems/places/:placeId/trend", () => {
  it("explains a known place", async () => {
    const res = await authedGet("/v1/hidden-gems/places/lon_normas/trend");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.placeId).toBe("lon_normas");
    expect(body.trendStage).toBe("early_rising");
    expect(body).toHaveProperty("velocity7d");
    expect(Array.isArray(body.explanation)).toBe(true);
  });

  it("404s an unknown place", async () => {
    const res = await authedGet("/v1/hidden-gems/places/nope/trend");
    expect(res.status).toBe(404);
  });
});

describe("POST /v1/hidden-gems/recommend-now", () => {
  it("returns context-aware recommendations, never saturated", async () => {
    const res = await authedPost("/v1/hidden-gems/recommend-now", {
      lat: 51.474,
      lng: -0.069,
      availableTimeMinutes: 120,
      mood: "low energy but wants something memorable",
      travellerType: "solo",
      budget: "low",
      avoid: ["crowds", "tourist traps"],
      weather: "light_rain",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      recommendations: Array<{ placeId: string; reasoningSummary: string }>;
    };
    expect(body.recommendations.length).toBeGreaterThan(0);
    expect(body.recommendations.length).toBeLessThanOrEqual(3);
    expect(body.recommendations[0]).toHaveProperty("reasoningSummary");
    expect(body.recommendations.some((r) => r.placeId === "lon_maltby_street")).toBe(false);
  });

  it("400s when lat/lng are missing", async () => {
    const res = await authedPost("/v1/hidden-gems/recommend-now", { mood: "hungry" });
    expect(res.status).toBe(400);
  });
});

describe("POST /v1/hidden-gems/resolve-social-post", () => {
  it("detects and matches a seeded place from caption + comments", async () => {
    const res = await authedPost("/v1/hidden-gems/resolve-social-post", {
      url: "https://www.tiktok.com/@someone/video/123",
      platform: "tiktok",
      caption: "Found the cutest spot — Norma's Coffee in Peckham!",
      comments: ["where is this??", "love Norma's"],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      detectedPlaces: Array<{ name: string; matchedPlaceId?: string; confidence: number }>;
    };
    expect(body.detectedPlaces.length).toBeGreaterThan(0);
    expect(body.detectedPlaces.some((d) => d.matchedPlaceId === "lon_normas")).toBe(true);
  });
});

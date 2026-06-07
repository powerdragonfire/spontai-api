// /v1/hidden-gems routes. Built on OpenAPIHono + createRoute so the Zod DTOs feed the
// OpenAPI 3.1 spec in Phase 4. All routes require hidden_gems:read; every service call
// (which fronts the repository — in-memory now, DynamoDB later) goes through
// withBreadcrumb so the mandatory Sentry pattern holds when the store becomes external.

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { buildHiddenGemsService } from "@/lib/hidden-gems";
import { requireScope } from "@/middleware/scope";
import { withBreadcrumb } from "@/middleware/sentry";
import {
  ErrorResponseSchema,
  HiddenGemSearchQuerySchema,
  HiddenGemSearchResponseSchema,
  PlaceTrendParamsSchema,
  PlaceTrendResponseSchema,
  RecommendNowRequestSchema,
  RecommendNowResponseSchema,
  ResolveSocialPostRequestSchema,
  ResolveSocialPostResponseSchema,
} from "@/schemas/hidden-gems";
import type { AppEnv } from "@/types/hono";

const json = <S>(schema: S, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

const errorResponses = {
  400: json(ErrorResponseSchema, "Invalid request"),
  401: json(ErrorResponseSchema, "Missing or invalid credentials"),
  403: json(ErrorResponseSchema, "Insufficient scope"),
};

export const hiddenGems = new OpenAPIHono<AppEnv>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "invalid_request",
          error_description: result.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    }
  },
});

// Every hidden-gems route needs the same scope.
hiddenGems.use("*", requireScope("hidden_gems:read"));

// ── GET /search ──────────────────────────────────────────────────────────────

const searchRoute = createRoute({
  method: "get",
  path: "/search",
  summary: "Search emerging, under-the-radar places (hidden gems) in a city.",
  description:
    "Returns real, locatable POIs that are socially rising but not yet mainstream, each with an explainable hiddenGemScore, trendStage, visitNowScore, crowdRisk and whyNow reasons. Saturated/over-exposed venues are suppressed (use avoidSaturated, trendStage and maxCrowdRisk to tune).",
  request: { query: HiddenGemSearchQuerySchema },
  responses: {
    200: json(HiddenGemSearchResponseSchema, "Ranked hidden gems"),
    ...errorResponses,
  },
});

hiddenGems.openapi(searchRoute, async (c) => {
  const query = c.req.valid("query");
  const svc = buildHiddenGemsService(c.env);
  const results = await withBreadcrumb(
    "hidden_gems_search",
    "search hidden gems",
    () => svc.search(query),
    { city: query.city ?? null, limit: query.limit },
  );
  return c.json({ results }, 200);
});

// ── GET /places/:placeId/trend ───────────────────────────────────────────────

const trendRoute = createRoute({
  method: "get",
  path: "/places/{placeId}/trend",
  summary: "Explain why a place is classified hidden, rising, peaking, saturated or declining.",
  description:
    "Returns the trend-stage classification for a place plus the component breakdown (velocities, social-velocity score, saturation/mainstream/maps-maturity penalties, localness) and a confidence score.",
  request: { params: PlaceTrendParamsSchema },
  responses: {
    200: json(PlaceTrendResponseSchema, "Trend breakdown"),
    404: json(ErrorResponseSchema, "Unknown place"),
    ...errorResponses,
  },
});

hiddenGems.openapi(trendRoute, async (c) => {
  const { placeId } = c.req.valid("param");
  const svc = buildHiddenGemsService(c.env);
  const trend = await withBreadcrumb(
    "hidden_gems_trend",
    "fetch place trend",
    () => svc.trend(placeId),
    { placeId },
  );
  if (!trend) {
    return c.json({ error: "not_found", error_description: `Unknown place: ${placeId}` }, 404);
  }
  return c.json(trend, 200);
});

// ── POST /recommend-now ──────────────────────────────────────────────────────

const recommendRoute = createRoute({
  method: "post",
  path: "/recommend-now",
  summary: "Recommend hidden gems for the user's current context (location, time, mood, weather).",
  description:
    "Compute-only (no persistence). Given a location, available time, mood, traveller type, budget, weather and things to avoid, returns a few open-now, low-saturation places worth visiting now, each with a reasoning + transport summary and backup options.",
  request: {
    body: {
      content: { "application/json": { schema: RecommendNowRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: json(RecommendNowResponseSchema, "Context-aware recommendations"),
    ...errorResponses,
  },
});

hiddenGems.openapi(recommendRoute, async (c) => {
  const input = c.req.valid("json");
  const svc = buildHiddenGemsService(c.env);
  const recommendations = await withBreadcrumb(
    "hidden_gems_recommend_now",
    "recommend hidden gems now",
    () => svc.recommendNow(input),
    { lat: input.lat, lng: input.lng },
  );
  return c.json({ recommendations }, 200);
});

// ── POST /resolve-social-post ────────────────────────────────────────────────

const resolveRoute = createRoute({
  method: "post",
  path: "/resolve-social-post",
  summary: "Resolve a social post's caption/comments into candidate real-world places.",
  description:
    "Compute-only. v1 extracts candidate place names from client-supplied caption + comments text (no server-side scraping of the URL) and matches them to known places. Returns detected places with confidence and evidence.",
  request: {
    body: {
      content: {
        "application/json": { schema: ResolveSocialPostRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    200: json(ResolveSocialPostResponseSchema, "Detected candidate places"),
    ...errorResponses,
  },
});

hiddenGems.openapi(resolveRoute, async (c) => {
  const input = c.req.valid("json");
  const svc = buildHiddenGemsService(c.env);
  const detectedPlaces = await withBreadcrumb(
    "hidden_gems_resolve_social_post",
    "resolve social post to places",
    () => svc.resolveSocialPost(input),
    { platform: input.platform },
  );
  return c.json({ detectedPlaces }, 200);
});

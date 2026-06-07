// Zod DTOs for the Hidden-Gems Intelligence module — the single source of truth for
// request/response shapes (and, in Phase 4, the OpenAPI 3.1 spec via app.doc31()).
// Uses the `z` re-exported by @hono/zod-openapi so .openapi() metadata is available.

import { z } from "@hono/zod-openapi";

// ── shared enums ─────────────────────────────────────────────────────────────

export const CategorySchema = z
  .enum(["cafe", "food", "bar", "activity", "culture", "outdoor"])
  .openapi("PlaceCategory");

export const TrendStageSchema = z
  .enum(["undiscovered", "early_rising", "peaking", "saturated", "declining"])
  .openapi("TrendStage");

export const CrowdRiskSchema = z
  .enum(["low", "low_to_medium", "medium", "medium_to_high", "high", "unknown"])
  .openapi("CrowdRisk");

export const TravellerTypeSchema = z.enum(["solo", "couple", "friends", "family"]);
export const BudgetSchema = z.enum(["low", "medium", "high"]);
export const WeatherSchema = z.enum(["clear", "clouds", "light_rain", "rain", "snow", "unknown"]);
export const PlatformSchema = z.enum(["tiktok", "instagram", "youtube", "unknown"]);

// Query-string booleans arrive as "true"/"false" strings; coerce explicitly
// (z.coerce.boolean treats any non-empty string — including "false" — as true).
const QueryBool = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .openapi({ type: "boolean" });

// ── GET /v1/hidden-gems/search ───────────────────────────────────────────────

export const HiddenGemSearchQuerySchema = z.object({
  city: z.string().min(1).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().positive().optional(),
  category: CategorySchema.optional(),
  mood: z.string().optional(),
  travellerType: TravellerTypeSchema.optional(),
  budget: BudgetSchema.optional(),
  timeWindow: z.enum(["7d", "14d", "30d"]).default("14d"),
  trendStage: TrendStageSchema.optional(),
  avoidSaturated: QueryBool.optional(),
  openNow: QueryBool.optional(),
  maxCrowdRisk: CrowdRiskSchema.optional(),
  limit: z.coerce.number().int().positive().max(50).default(10),
});
export type HiddenGemSearchQuery = z.infer<typeof HiddenGemSearchQuerySchema>;

export const EvidenceSchema = z
  .object({
    socialVelocity: z.string(),
    mapsMaturity: z.string(),
    creatorDensity: z.string(),
    touristSaturation: z.string(),
  })
  .openapi("HiddenGemEvidence");

export const HiddenGemResultSchema = z
  .object({
    placeId: z.string(),
    name: z.string(),
    category: CategorySchema,
    neighbourhood: z.string().optional(),
    lat: z.number(),
    lng: z.number(),
    hiddenGemScore: z.number(),
    trendStage: TrendStageSchema,
    visitNowScore: z.number(),
    crowdRisk: CrowdRiskSchema,
    bestVisitWindow: z.string(),
    confidence: z.number(),
    whyNow: z.array(z.string()),
    evidence: EvidenceSchema,
  })
  .openapi("HiddenGemResult");
export type HiddenGemResult = z.infer<typeof HiddenGemResultSchema>;

export const HiddenGemSearchResponseSchema = z
  .object({ results: z.array(HiddenGemResultSchema) })
  .openapi("HiddenGemSearchResponse");

// ── GET /v1/hidden-gems/places/:placeId/trend ────────────────────────────────

export const PlaceTrendParamsSchema = z.object({
  placeId: z
    .string()
    .min(1)
    .openapi({ param: { name: "placeId", in: "path" } }),
});

export const PlaceTrendResponseSchema = z
  .object({
    placeId: z.string(),
    name: z.string(),
    trendStage: TrendStageSchema,
    velocity7d: z.number(),
    velocity30d: z.number(),
    socialVelocityScore: z.number(),
    saturationPenalty: z.number(),
    mainstreamCoveragePenalty: z.number(),
    mapsMaturityPenalty: z.number(),
    localnessScore: z.number(),
    confidence: z.number(),
    explanation: z.array(z.string()),
  })
  .openapi("PlaceTrendResponse");

// ── POST /v1/hidden-gems/recommend-now ───────────────────────────────────────

export const RecommendNowRequestSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    availableTimeMinutes: z.number().int().positive().optional(),
    mood: z.string().optional(),
    travellerType: TravellerTypeSchema.optional(),
    budget: BudgetSchema.optional(),
    avoid: z.array(z.string()).optional(),
    weather: WeatherSchema.optional(),
    limit: z.number().int().positive().max(20).default(3),
  })
  .openapi("RecommendNowRequest");
export type RecommendNowRequest = z.infer<typeof RecommendNowRequestSchema>;

export const RecommendationSchema = z
  .object({
    placeId: z.string(),
    name: z.string(),
    reasoningSummary: z.string(),
    transportSummary: z.string(),
    backupOptions: z.array(z.object({ placeId: z.string(), name: z.string() })),
  })
  .openapi("HiddenGemRecommendation");

export const RecommendNowResponseSchema = z
  .object({ recommendations: z.array(RecommendationSchema) })
  .openapi("RecommendNowResponse");

// ── POST /v1/hidden-gems/resolve-social-post ─────────────────────────────────

export const ResolveSocialPostRequestSchema = z
  .object({
    url: z.string().url(),
    platform: PlatformSchema.default("unknown"),
    caption: z.string().optional(),
    comments: z.array(z.string()).optional(),
  })
  .openapi("ResolveSocialPostRequest");
export type ResolveSocialPostRequest = z.infer<typeof ResolveSocialPostRequestSchema>;

export const DetectedPlaceSchema = z
  .object({
    name: z.string(),
    confidence: z.number(),
    matchedPlaceId: z.string().optional(),
    evidence: z.array(z.string()),
  })
  .openapi("DetectedPlace");

export const ResolveSocialPostResponseSchema = z
  .object({ detectedPlaces: z.array(DetectedPlaceSchema) })
  .openapi("ResolveSocialPostResponse");

// ── shared error shape (matches the OAuth-style errors auth already returns) ──

export const ErrorResponseSchema = z
  .object({ error: z.string(), error_description: z.string() })
  .openapi("ErrorResponse");

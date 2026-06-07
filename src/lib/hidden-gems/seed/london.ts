// Canonical London seed dataset. Doubles as the in-memory test/dev fixture AND the
// source rows for scripts/seed-dynamo.ts. Hand-authored, intentionally spanning every
// trend stage so search/suppression behaviour is demonstrable:
//   early_rising ×4 · peaking ×2 · saturated ×2 · declining ×1 · undiscovered ×1
//
// NOTE: these are illustrative aggregated signals, not live data. Real signals arrive
// via the (gated) Google Places + social-trend providers.

import type {
  HiddenGemRecord,
  OpenInterval,
  PlaceTrendSignal,
  ResolvedPlace,
  WeeklyHours,
} from "@/types/hidden-gems";

// Open `openH:00`–`closeH:00` on the given days (0=Sun..6=Sat); closed otherwise.
function hours(openH: number, closeH: number, days: number[]): WeeklyHours {
  const week: OpenInterval[][] = [[], [], [], [], [], [], []];
  const interval: OpenInterval = { openMin: openH * 60, closeMin: closeH * 60 };
  for (const d of days) week[d] = [interval];
  return week;
}

const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];

function record(
  place: ResolvedPlace,
  signal: Omit<PlaceTrendSignal, "resolvedPlaceId">,
  suppression?: HiddenGemRecord["suppression"],
): HiddenGemRecord {
  const full: HiddenGemRecord = {
    place,
    signal: { resolvedPlaceId: place.id, ...signal },
  };
  return suppression ? { ...full, suppression } : full;
}

const SEEN = { firstSeenAt: "2026-05-01T00:00:00Z", lastSeenAt: "2026-06-06T00:00:00Z" };

export const LONDON_RECORDS: readonly HiddenGemRecord[] = [
  // ── early_rising — the product's target band ────────────────────────────────
  record(
    {
      id: "lon_normas",
      googlePlaceId: "gp_lon_normas",
      name: "Norma's Coffee",
      city: "London",
      neighbourhood: "Peckham",
      category: "cafe",
      lat: 51.474,
      lng: -0.069,
      rating: 4.7,
      reviewCount: 90,
      openingHours: hours(8, 16, ALL_WEEK),
      priceLevel: "low",
      mainstreamCovered: false,
    },
    {
      platform: "tiktok",
      mentionCount7d: 21,
      mentionCount30d: 44,
      velocity7d: 18,
      velocity30d: 7,
      engagementScore: 0.72,
      saveIntentScore: 0.64,
      commentIntentScore: 0.58,
      creatorDensity: 0.2,
      localCreatorRatio: 0.78,
      touristCreatorRatio: 0.1,
      ...SEEN,
    },
  ),
  record(
    {
      id: "lon_silo",
      googlePlaceId: "gp_lon_silo",
      name: "Silo Bakehouse",
      city: "London",
      neighbourhood: "Hackney Wick",
      category: "food",
      lat: 51.543,
      lng: -0.024,
      rating: 4.6,
      reviewCount: 160,
      openingHours: hours(9, 17, ALL_WEEK),
      priceLevel: "medium",
      mainstreamCovered: false,
    },
    {
      platform: "instagram",
      mentionCount7d: 16,
      mentionCount30d: 38,
      velocity7d: 14,
      velocity30d: 6,
      engagementScore: 0.66,
      saveIntentScore: 0.6,
      commentIntentScore: 0.5,
      creatorDensity: 0.26,
      localCreatorRatio: 0.7,
      touristCreatorRatio: 0.14,
      ...SEEN,
    },
  ),
  record(
    {
      id: "lon_brockley_brewery",
      googlePlaceId: "gp_lon_brockley",
      name: "Brockley Brewery",
      city: "London",
      neighbourhood: "Brockley",
      category: "activity",
      lat: 51.464,
      lng: -0.037,
      rating: 4.7,
      reviewCount: 300,
      openingHours: hours(12, 22, [4, 5, 6]),
      priceLevel: "medium",
      mainstreamCovered: false,
    },
    {
      platform: "tiktok",
      mentionCount7d: 13,
      mentionCount30d: 31,
      velocity7d: 12,
      velocity30d: 5,
      engagementScore: 0.6,
      saveIntentScore: 0.55,
      commentIntentScore: 0.48,
      creatorDensity: 0.3,
      localCreatorRatio: 0.72,
      touristCreatorRatio: 0.12,
      ...SEEN,
    },
  ),
  record(
    {
      id: "lon_little_nans",
      googlePlaceId: "gp_lon_little_nans",
      name: "Little Nan's Bar",
      city: "London",
      neighbourhood: "Deptford",
      category: "bar",
      lat: 51.479,
      lng: -0.026,
      rating: 4.8,
      reviewCount: 250,
      openingHours: hours(17, 24, [4, 5, 6]),
      priceLevel: "low",
      mainstreamCovered: false,
    },
    {
      platform: "tiktok",
      mentionCount7d: 18,
      mentionCount30d: 40,
      velocity7d: 16,
      velocity30d: 7,
      engagementScore: 0.7,
      saveIntentScore: 0.62,
      commentIntentScore: 0.6,
      creatorDensity: 0.35,
      localCreatorRatio: 0.66,
      touristCreatorRatio: 0.2,
      ...SEEN,
    },
  ),

  // ── peaking — strong heat, saturation climbing into the medium band ─────────
  record(
    {
      id: "lon_sun_tavern",
      googlePlaceId: "gp_lon_sun_tavern",
      name: "The Sun Tavern",
      city: "London",
      neighbourhood: "Bethnal Green",
      category: "bar",
      lat: 51.527,
      lng: -0.055,
      rating: 4.5,
      reviewCount: 520,
      openingHours: hours(16, 24, ALL_WEEK),
      priceLevel: "medium",
      mainstreamCovered: false,
    },
    {
      platform: "tiktok",
      mentionCount7d: 30,
      mentionCount30d: 70,
      velocity7d: 24,
      velocity30d: 12,
      engagementScore: 0.78,
      saveIntentScore: 0.5,
      commentIntentScore: 0.46,
      creatorDensity: 0.55,
      localCreatorRatio: 0.42,
      touristCreatorRatio: 0.36,
      ...SEEN,
    },
  ),
  record(
    {
      id: "lon_dishoom_kings",
      googlePlaceId: "gp_lon_dishoom_kings",
      name: "Dalston Eastern Curve Garden",
      city: "London",
      neighbourhood: "Dalston",
      category: "outdoor",
      lat: 51.546,
      lng: -0.075,
      rating: 4.6,
      reviewCount: 640,
      openingHours: hours(10, 20, ALL_WEEK),
      priceLevel: "low",
      mainstreamCovered: false,
    },
    {
      platform: "instagram",
      mentionCount7d: 28,
      mentionCount30d: 66,
      velocity7d: 22,
      velocity30d: 13,
      engagementScore: 0.74,
      saveIntentScore: 0.52,
      commentIntentScore: 0.44,
      creatorDensity: 0.5,
      localCreatorRatio: 0.48,
      touristCreatorRatio: 0.3,
      ...SEEN,
    },
  ),

  // ── saturated — must be excluded when avoidSaturated=true ────────────────────
  record(
    {
      id: "lon_maltby_street",
      googlePlaceId: "gp_lon_maltby",
      name: "Maltby Street Market",
      city: "London",
      neighbourhood: "Bermondsey",
      category: "food",
      lat: 51.499,
      lng: -0.081,
      rating: 4.4,
      reviewCount: 1800,
      openingHours: hours(10, 16, [6, 0]),
      priceLevel: "medium",
      mainstreamCovered: true,
    },
    {
      platform: "tiktok",
      mentionCount7d: 40,
      mentionCount30d: 120,
      velocity7d: 30,
      velocity30d: 26,
      engagementScore: 0.8,
      saveIntentScore: 0.4,
      commentIntentScore: 0.3,
      creatorDensity: 0.85,
      localCreatorRatio: 0.3,
      touristCreatorRatio: 0.62,
      ...SEEN,
    },
    {
      resolvedPlaceId: "lon_maltby_street",
      suppressReason: "saturated",
      crowdRiskSuppression: true,
    },
  ),
  record(
    {
      id: "lon_sky_garden",
      googlePlaceId: "gp_lon_sky_garden",
      name: "Sky Garden",
      city: "London",
      neighbourhood: "City of London",
      category: "culture",
      lat: 51.5113,
      lng: -0.0838,
      rating: 4.4,
      reviewCount: 26000,
      openingHours: hours(10, 18, ALL_WEEK),
      priceLevel: "low",
      mainstreamCovered: true,
    },
    {
      platform: "instagram",
      mentionCount7d: 35,
      mentionCount30d: 150,
      velocity7d: 20,
      velocity30d: 28,
      engagementScore: 0.7,
      saveIntentScore: 0.35,
      commentIntentScore: 0.25,
      creatorDensity: 0.9,
      localCreatorRatio: 0.2,
      touristCreatorRatio: 0.75,
      ...SEEN,
    },
    { resolvedPlaceId: "lon_sky_garden", suppressReason: "mainstream", crowdRiskSuppression: true },
  ),

  // ── declining — past its peak (7d velocity well below 30d baseline) ──────────
  record(
    {
      id: "lon_gods_junkyard",
      googlePlaceId: "gp_lon_gods_junkyard",
      name: "God's Own Junkyard",
      city: "London",
      neighbourhood: "Walthamstow",
      category: "culture",
      lat: 51.587,
      lng: -0.02,
      rating: 4.6,
      reviewCount: 900,
      openingHours: hours(11, 18, [5, 6, 0]),
      priceLevel: "low",
      mainstreamCovered: false,
    },
    {
      platform: "tiktok",
      mentionCount7d: 4,
      mentionCount30d: 36,
      velocity7d: 3,
      velocity30d: 10,
      engagementScore: 0.5,
      saveIntentScore: 0.4,
      commentIntentScore: 0.3,
      creatorDensity: 0.4,
      localCreatorRatio: 0.5,
      touristCreatorRatio: 0.4,
      ...SEEN,
    },
  ),

  // ── undiscovered — too little data to trust (low confidence) ─────────────────
  record(
    {
      id: "lon_hidden_yard",
      name: "Hidden Yard Coffee",
      city: "London",
      neighbourhood: "Leyton",
      category: "cafe",
      lat: 51.566,
      lng: -0.012,
      reviewCount: 12,
      openingHours: hours(8, 15, WEEKDAYS),
      priceLevel: "low",
      mainstreamCovered: false,
    },
    {
      platform: "unknown",
      mentionCount7d: 2,
      mentionCount30d: 3,
      velocity7d: 2,
      velocity30d: 1,
      engagementScore: 0,
      saveIntentScore: 0,
      commentIntentScore: 0,
      creatorDensity: 0.1,
      localCreatorRatio: 0,
      touristCreatorRatio: 0,
      ...SEEN,
    },
  ),
];

export const LONDON_PLACES: readonly ResolvedPlace[] = LONDON_RECORDS.map((r) => r.place);
export const LONDON_SIGNALS: readonly PlaceTrendSignal[] = LONDON_RECORDS.map((r) => r.signal);

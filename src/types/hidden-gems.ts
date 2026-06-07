// Internal domain entities for the Hidden-Gems Intelligence module.
// These are the shapes the scoring engine and repositories operate on.
// API request/response DTOs live separately in src/schemas/hidden-gems.ts.

export type PlaceCategory = "cafe" | "food" | "bar" | "activity" | "culture" | "outdoor";

export type TrendStage = "undiscovered" | "early_rising" | "peaking" | "saturated" | "declining";

export type CrowdRisk = "low" | "low_to_medium" | "medium" | "medium_to_high" | "high" | "unknown";

export type TravellerType = "solo" | "couple" | "friends" | "family";

export type Budget = "low" | "medium" | "high";

export type SourcePlatform = "tiktok" | "instagram" | "youtube" | "manual" | "unknown";

/** A real-world POI validated against a place-of-truth provider (Google Places in prod). */
export interface ResolvedPlace {
  id: string;
  googlePlaceId?: string;
  name: string;
  city: string;
  neighbourhood?: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  /** Google star rating 0..5, if known. */
  rating?: number;
  /** Total Google review count — a key "maps maturity" signal. */
  reviewCount?: number;
  /** Weekly opening hours, 0=Sunday..6=Saturday; minutes-of-day ranges. */
  openingHours?: WeeklyHours;
  priceLevel?: Budget;
  website?: string;
  /** True when the place is widely covered by mainstream travel media / listicles. */
  mainstreamCovered?: boolean;
}

export interface OpenInterval {
  /** Minutes from midnight, local time. */
  openMin: number;
  closeMin: number;
}

/** Index 0=Sunday .. 6=Saturday. Empty array = closed that day. */
export type WeeklyHours = readonly (readonly OpenInterval[])[];

/** Aggregated social-trend metrics for a place. Never raw scraped personal data. */
export interface PlaceTrendSignal {
  resolvedPlaceId: string;
  platform: SourcePlatform;
  mentionCount7d: number;
  mentionCount30d: number;
  /** New mentions/day over the trailing 7d and 30d windows. */
  velocity7d: number;
  velocity30d: number;
  /** 0..1 normalised engagement (likes/comments/shares per mention). */
  engagementScore: number;
  /** 0..1 share of "saving"/"bookmarking" intent. */
  saveIntentScore: number;
  /** 0..1 share of comments asking "where is this?". */
  commentIntentScore: number;
  /** 0..1 how many distinct creators are posting (crowding signal). */
  creatorDensity: number;
  /** 0..1 share of creators who appear to be locals. */
  localCreatorRatio: number;
  /** 0..1 share of creators who appear to be tourists. */
  touristCreatorRatio: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface SuppressionPolicy {
  resolvedPlaceId: string;
  suppressReason?: string;
  /** Cap on how often this place may surface per day (small-venue protection). */
  maxDailyExposure?: number;
  crowdRiskSuppression?: boolean;
  smallVenueProtection?: boolean;
}

/** The aggregate a repository returns for a place: everything scoring needs. */
export interface HiddenGemRecord {
  place: ResolvedPlace;
  signal: PlaceTrendSignal;
  suppression?: SuppressionPolicy;
}

/** One additively-weighted contribution to a composite score, kept for explainability. */
export interface ScoreComponent {
  key: string;
  /** Signed points this component contributed to the composite. */
  points: number;
  /** Human-readable reason — surfaced in whyNow[] / explanation[]. */
  reason: string;
}

export interface HiddenGemScoreResult {
  /** 0..100 clamped. */
  hiddenGemScore: number;
  trendStage: TrendStage;
  /** 0..1 — lower when data is sparse; never fabricated. */
  confidence: number;
  components: ScoreComponent[];
}

export interface VisitabilityScoreResult {
  /** 0..100 clamped. */
  visitNowScore: number;
  crowdRisk: CrowdRisk;
  openNow: boolean;
  bestVisitWindow: string;
  components: ScoreComponent[];
}

/** Time/location/user context for visitability scoring. Pure inputs — no IO. */
export interface VisitContext {
  /** Caller location. */
  lat: number;
  lng: number;
  /** Local minutes-from-midnight "now". */
  nowMinuteOfDay: number;
  /** Local day of week, 0=Sunday..6=Saturday. */
  nowDayOfWeek: number;
  availableTimeMinutes?: number;
  weather?: "clear" | "clouds" | "light_rain" | "rain" | "snow" | "unknown";
  travellerType?: TravellerType;
  budget?: Budget;
  mood?: string;
  avoid?: string[];
}

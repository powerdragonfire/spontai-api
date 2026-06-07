// Pure, explainable v1 scoring for the Hidden-Gems Intelligence module.
// No IO, no randomness — every function is deterministic and unit-testable.
// Each composite returns a `components` breakdown so the API can explain itself
// (whyNow[] / evidence{} / explanation[]) instead of emitting opaque numbers.

import {
  CONFIDENCE_REQUIRED_SIGNALS,
  DISTANCE_FULL_KM,
  DISTANCE_ZERO_KM,
  MAPS_MATURITY_REVIEW_CEILING,
  VISIT_NOW_WEIGHTS as V,
  VELOCITY_NORMALISER,
  HIDDEN_GEM_WEIGHTS as W,
} from "@/lib/hidden-gems/weights";
import type {
  CrowdRisk,
  HiddenGemRecord,
  HiddenGemScoreResult,
  PlaceTrendSignal,
  ResolvedPlace,
  ScoreComponent,
  TrendStage,
  VisitabilityScoreResult,
  VisitContext,
} from "@/types/hidden-gems";

// ── small pure helpers ───────────────────────────────────────────────────────

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Map a raw value into 0..1 against a soft ceiling. */
export function normalise(value: number, ceiling: number): number {
  if (ceiling <= 0) return 0;
  return clamp(value / ceiling, 0, 1);
}

const round = (n: number): number => Math.round(n * 100) / 100;

// ── hiddenGemScore components ────────────────────────────────────────────────

export function socialVelocityScore(s: PlaceTrendSignal): ScoreComponent {
  const heat = normalise(s.velocity7d, VELOCITY_NORMALISER);
  return {
    key: "socialVelocity",
    points: round(heat * W.socialVelocityMax),
    reason: `Social mentions rising (${s.velocity7d.toFixed(1)}/day over 7d)`,
  };
}

export function localnessScore(s: PlaceTrendSignal): ScoreComponent {
  return {
    key: "localness",
    points: round(clamp(s.localCreatorRatio, 0, 1) * W.localnessMax),
    reason: `Posted mostly by locals (${Math.round(s.localCreatorRatio * 100)}% local creators)`,
  };
}

export function saveIntentScore(s: PlaceTrendSignal): ScoreComponent {
  return {
    key: "saveIntent",
    points: round(clamp(s.saveIntentScore, 0, 1) * W.saveIntentMax),
    reason: `High save/bookmark intent (${Math.round(s.saveIntentScore * 100)}%)`,
  };
}

export function commentIntentScore(s: PlaceTrendSignal): ScoreComponent {
  return {
    key: "commentIntent",
    points: round(clamp(s.commentIntentScore, 0, 1) * W.commentIntentMax),
    reason: `Comments asking "where is this?" (${Math.round(s.commentIntentScore * 100)}%)`,
  };
}

export function saturationPenalty(s: PlaceTrendSignal): ScoreComponent {
  // Crowding from many creators posting the same place.
  const penalty = clamp(s.creatorDensity, 0, 1) * W.saturationPenaltyMax;
  return {
    key: "saturationPenalty",
    points: -round(penalty),
    reason: `Creator crowding (${Math.round(s.creatorDensity * 100)}% density)`,
  };
}

export function touristTrapPenalty(s: PlaceTrendSignal): ScoreComponent {
  const penalty = clamp(s.touristCreatorRatio, 0, 1) * W.touristTrapPenaltyMax;
  return {
    key: "touristTrapPenalty",
    points: -round(penalty),
    reason: `Tourist-heavy audience (${Math.round(s.touristCreatorRatio * 100)}%)`,
  };
}

export function mainstreamCoveragePenalty(p: ResolvedPlace): ScoreComponent {
  const penalty = p.mainstreamCovered ? W.mainstreamCoveragePenaltyMax : 0;
  return {
    key: "mainstreamCoveragePenalty",
    points: -round(penalty),
    reason: p.mainstreamCovered
      ? "Already covered by mainstream travel media"
      : "Low mainstream coverage",
  };
}

export function mapsMaturityPenalty(p: ResolvedPlace): ScoreComponent {
  const maturity = normalise(p.reviewCount ?? 0, MAPS_MATURITY_REVIEW_CEILING);
  return {
    key: "mapsMaturityPenalty",
    points: -round(maturity * W.mapsMaturityPenaltyMax),
    reason: `Google review maturity (${p.reviewCount ?? 0} reviews)`,
  };
}

/** Composite 0..100 hidden-gem score with full component breakdown. */
export function computeHiddenGemScore(record: HiddenGemRecord): {
  score: number;
  components: ScoreComponent[];
} {
  const { place, signal } = record;
  const components: ScoreComponent[] = [
    socialVelocityScore(signal),
    localnessScore(signal),
    saveIntentScore(signal),
    commentIntentScore(signal),
    saturationPenalty(signal),
    touristTrapPenalty(signal),
    mainstreamCoveragePenalty(place),
    mapsMaturityPenalty(place),
  ];
  const raw = components.reduce((sum, c) => sum + c.points, 0);
  return { score: round(clamp(raw, 0, 100)), components };
}

// ── trend-stage classification — see classifyTrendStage below ────────────────

/** Derived, normalised inputs handed to the stage classifier (all 0..1 except velocities). */
export interface TrendInputs {
  /** New mentions/day over the trailing 7 days. */
  velocity7d: number;
  /** New mentions/day over the trailing 30 days (the longer-run baseline). */
  velocity30d: number;
  /** 0..1 creator-crowding (how many distinct creators are posting it). */
  saturation: number;
  /** 0..1 Google "maps maturity" (review count vs ceiling). */
  mapsMaturity: number;
  /** True when the place is widely covered by mainstream travel media. */
  mainstreamCovered: boolean;
  /** How many of the rich signals are present (low → likely "undiscovered"). */
  dataPoints: number;
}

export function trendInputsFrom(record: HiddenGemRecord): TrendInputs {
  const { place, signal } = record;
  return {
    velocity7d: signal.velocity7d,
    velocity30d: signal.velocity30d,
    saturation: clamp(signal.creatorDensity, 0, 1),
    mapsMaturity: normalise(place.reviewCount ?? 0, MAPS_MATURITY_REVIEW_CEILING),
    mainstreamCovered: place.mainstreamCovered ?? false,
    dataPoints: countSignals(signal),
  };
}

/**
 * Classify a place into its trend lifecycle stage.
 *
 * This is the product's core judgment call: it decides whether a place surfaces
 * as a hidden gem or gets suppressed as already-obvious. Suppression, the
 * `avoidSaturated` filter, and the whyNow copy all key off the result.
 *
 * Stages (return one of these):
 *  - "undiscovered": too little data to trust (low dataPoints) → low confidence later
 *  - "early_rising": positive 7d velocity, low saturation AND low mapsMaturity (the sweet spot)
 *  - "peaking":      strong velocity but saturation is climbing into the medium band
 *  - "saturated":    high saturation OR high mapsMaturity OR mainstreamCovered (NOT a hidden gem)
 *  - "declining":    7d velocity has fallen well below the 30d baseline (past its peak)
 *
 * Trade-off to weigh: set the peaking→saturated line too low and you starve the
 * results list; too high and you recommend tourist traps as "gems".
 *
 * TODO(you): implement the threshold logic. ~6-10 lines. Tests in
 * tests/lib/hidden-gems/scoring.test.ts pin the expected boundaries.
 */
export function classifyTrendStage(t: TrendInputs): TrendStage {
  // Guard-clause cascade: disqualifiers first, then the positive case, peaking is the fallthrough.
  if (t.dataPoints < 2) return "undiscovered";
  if (t.saturation >= 0.7 || t.mapsMaturity >= 0.7 || t.mainstreamCovered) return "saturated";
  if (t.velocity7d < 0.5 * t.velocity30d) return "declining";
  if (t.saturation < 0.4 && t.mapsMaturity < 0.4 && t.velocity7d > 0) return "early_rising";
  return "peaking";
}

// ── confidence ───────────────────────────────────────────────────────────────

function countSignals(s: PlaceTrendSignal): number {
  // Count the "rich" signals that are actually populated (non-zero).
  const rich = [
    s.velocity7d,
    s.engagementScore,
    s.saveIntentScore,
    s.commentIntentScore,
    s.localCreatorRatio,
  ];
  return rich.filter((v) => v > 0).length;
}

/** 0..1 confidence: weak/sparse data → low confidence. Never fabricate certainty. */
export function computeConfidence(record: HiddenGemRecord): number {
  const present = countSignals(record.signal);
  const dataCompleteness = normalise(present, CONFIDENCE_REQUIRED_SIGNALS);
  // A resolved Google place id is a strong "this is real" boost.
  const resolvedBoost = record.place.googlePlaceId ? 0.15 : 0;
  // Tiny sample sizes cap confidence.
  const volume = normalise(record.signal.mentionCount30d, 30);
  return round(clamp(0.85 * dataCompleteness * (0.6 + 0.4 * volume) + resolvedBoost, 0, 1));
}

/** One-call hidden-gem result: score + stage + confidence + breakdown. */
export function scoreHiddenGem(record: HiddenGemRecord): HiddenGemScoreResult {
  const { score, components } = computeHiddenGemScore(record);
  return {
    hiddenGemScore: score,
    trendStage: classifyTrendStage(trendInputsFrom(record)),
    confidence: computeConfidence(record),
    components,
  };
}

// ── visitability ─────────────────────────────────────────────────────────────

/** Haversine great-circle distance in km. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isOpenAt(place: ResolvedPlace, day: number, minuteOfDay: number): boolean {
  const hours = place.openingHours;
  if (!hours) return false;
  const today = hours[day];
  if (!today) return false;
  return today.some((iv) => minuteOfDay >= iv.openMin && minuteOfDay < iv.closeMin);
}

const INDOOR: ReadonlySet<ResolvedPlace["category"]> = new Set(["cafe", "food", "bar", "culture"]);

function openNowComponent(
  place: ResolvedPlace,
  ctx: VisitContext,
): { open: boolean; c: ScoreComponent } {
  const open = isOpenAt(place, ctx.nowDayOfWeek, ctx.nowMinuteOfDay);
  return {
    open,
    c: {
      key: "openNow",
      points: open ? V.openNowMax : 0,
      reason: open ? "Open right now" : "Closed right now",
    },
  };
}

function distanceComponent(place: ResolvedPlace, ctx: VisitContext): ScoreComponent {
  const km = haversineKm(ctx.lat, ctx.lng, place.lat, place.lng);
  // Linear falloff between DISTANCE_FULL_KM and DISTANCE_ZERO_KM.
  const span = DISTANCE_ZERO_KM - DISTANCE_FULL_KM;
  const closeness = clamp(1 - (km - DISTANCE_FULL_KM) / span, 0, 1);
  return {
    key: "distance",
    points: round(closeness * V.distanceMax),
    reason: `${km.toFixed(1)} km away`,
  };
}

function weatherFitComponent(place: ResolvedPlace, ctx: VisitContext): ScoreComponent {
  const indoor = INDOOR.has(place.category);
  const wet = ctx.weather === "light_rain" || ctx.weather === "rain" || ctx.weather === "snow";
  // Indoor in bad weather = full points; outdoor in bad weather = none.
  const fit = !wet ? 0.8 : indoor ? 1 : 0;
  return {
    key: "weatherFit",
    points: round(fit * V.weatherFitMax),
    reason: wet
      ? indoor
        ? "Indoors — good for the weather"
        : "Outdoors in poor weather"
      : "Weather is fine",
  };
}

function crowdComponents(
  record: HiddenGemRecord,
  ctx: VisitContext,
): { risk: CrowdRisk; c: ScoreComponent } {
  const risk = estimateCrowdRisk(record, ctx);
  const riskPoints: Record<CrowdRisk, number> = {
    low: 1,
    low_to_medium: 0.75,
    medium: 0.5,
    medium_to_high: 0.25,
    high: 0,
    unknown: 0.5,
  };
  return {
    risk,
    c: {
      key: "crowd",
      points: round(riskPoints[risk] * V.crowdMax),
      reason: `Crowd risk: ${risk.replace(/_/g, " ")}`,
    },
  };
}

function timeOfDayFitComponent(place: ResolvedPlace, ctx: VisitContext): ScoreComponent {
  // Cafés fit mornings/afternoons; bars fit evenings; everything else neutral.
  const hour = Math.floor(ctx.nowMinuteOfDay / 60);
  let fit = 0.5;
  if (place.category === "cafe") fit = hour >= 7 && hour < 16 ? 1 : 0.3;
  else if (place.category === "bar") fit = hour >= 17 && hour < 24 ? 1 : 0.2;
  else if (place.category === "outdoor") fit = hour >= 8 && hour < 19 ? 1 : 0.3;
  return {
    key: "timeOfDayFit",
    points: round(fit * V.timeOfDayFitMax),
    reason: "Time-of-day fit for category",
  };
}

function userPreferenceFitComponent(place: ResolvedPlace, ctx: VisitContext): ScoreComponent {
  let fit = 0.6;
  if (ctx.budget && place.priceLevel) fit += place.priceLevel === ctx.budget ? 0.3 : -0.1;
  if (ctx.avoid?.includes("crowds")) fit += 0.1;
  return {
    key: "userPreferenceFit",
    points: round(clamp(fit, 0, 1) * V.userPreferenceFitMax),
    reason: "Fit for budget / traveller preferences",
  };
}

/** Heuristic crowd-risk bucket (BestTime foot-traffic is a future provider). */
export function estimateCrowdRisk(record: HiddenGemRecord, ctx: VisitContext): CrowdRisk {
  const { signal } = record;
  if (countSignals(signal) < 2) return "unknown";
  // Base on creator density + tourist ratio; weekends and evenings nudge it up.
  let heat = 0.5 * signal.creatorDensity + 0.5 * signal.touristCreatorRatio;
  const weekend = ctx.nowDayOfWeek === 0 || ctx.nowDayOfWeek === 6;
  const evening = ctx.nowMinuteOfDay >= 18 * 60;
  if (weekend) heat += 0.1;
  if (evening) heat += 0.1;
  heat = clamp(heat, 0, 1);
  if (heat < 0.2) return "low";
  if (heat < 0.4) return "low_to_medium";
  if (heat < 0.6) return "medium";
  if (heat < 0.8) return "medium_to_high";
  return "high";
}

function bestVisitWindow(place: ResolvedPlace): string {
  switch (place.category) {
    case "cafe":
      return "weekday morning";
    case "bar":
      return "weekday evening";
    case "outdoor":
      return "weekday afternoon";
    default:
      return "weekday afternoon";
  }
}

export function scoreVisitability(
  record: HiddenGemRecord,
  ctx: VisitContext,
): VisitabilityScoreResult {
  const open = openNowComponent(record.place, ctx);
  const crowd = crowdComponents(record, ctx);
  const components: ScoreComponent[] = [
    open.c,
    distanceComponent(record.place, ctx),
    weatherFitComponent(record.place, ctx),
    crowd.c,
    timeOfDayFitComponent(record.place, ctx),
    userPreferenceFitComponent(record.place, ctx),
  ];
  const raw = components.reduce((sum, c) => sum + c.points, 0);
  return {
    visitNowScore: round(clamp(raw, 0, 100)),
    crowdRisk: crowd.risk,
    openNow: open.open,
    bestVisitWindow: bestVisitWindow(record.place),
    components,
  };
}

// ── suppression / exposure control ───────────────────────────────────────────

/** True when a place should NOT be surfaced as a hidden gem (saturated/suppressed). */
export function isSuppressed(record: HiddenGemRecord, stage: TrendStage): boolean {
  if (stage === "saturated") return true;
  if (record.suppression?.crowdRiskSuppression && record.place.mainstreamCovered) return true;
  return false;
}

/**
 * Deterministic rotation for small-venue protection: stable hash of placeId + a
 * rotation bucket (e.g. day index) so a tiny venue isn't shown to everyone at once,
 * without using Math.random (keeps it test-friendly).
 */
export function rotationHash(placeId: string, bucket: number): number {
  let h = 2166136261 ^ bucket;
  for (let i = 0; i < placeId.length; i++) {
    h ^= placeId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff; // 0..1
}

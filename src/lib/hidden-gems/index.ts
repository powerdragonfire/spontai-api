// Hidden-Gems service: the seam between route handlers and the engine. It owns the
// repository + providers, runs scoring, applies filters/suppression, and maps domain
// records to the API DTOs. Route handlers stay thin and just call these methods.

import { TextContentExtractor } from "@/lib/hidden-gems/providers/content-extraction";
import type { ContentExtractionProvider } from "@/lib/hidden-gems/providers/types";
import {
  createHiddenGemsRepository,
  type HiddenGemsRepository,
} from "@/lib/hidden-gems/repository";
import {
  haversineKm,
  isSuppressed,
  scoreHiddenGem,
  scoreVisitability,
} from "@/lib/hidden-gems/scoring";
import type {
  HiddenGemResult,
  HiddenGemSearchQuery,
  RecommendNowRequest,
  ResolveSocialPostRequest,
} from "@/schemas/hidden-gems";
import type {
  CrowdRisk,
  HiddenGemRecord,
  HiddenGemScoreResult,
  VisitabilityScoreResult,
  VisitContext,
} from "@/types/hidden-gems";
import type { AppEnv } from "@/types/hono";

const CROWD_ORDER: Record<CrowdRisk, number> = {
  low: 0,
  low_to_medium: 1,
  medium: 2,
  medium_to_high: 3,
  high: 4,
  unknown: 2,
};

export interface HiddenGemsServiceDeps {
  repository?: HiddenGemsRepository;
  extractor?: ContentExtractionProvider;
  /** Injected "now" for deterministic tests; defaults to wall clock. */
  now?: Date;
}

export interface PlaceTrendDto {
  placeId: string;
  name: string;
  trendStage: HiddenGemScoreResult["trendStage"];
  velocity7d: number;
  velocity30d: number;
  socialVelocityScore: number;
  saturationPenalty: number;
  mainstreamCoveragePenalty: number;
  mapsMaturityPenalty: number;
  localnessScore: number;
  confidence: number;
  explanation: string[];
}

export interface RecommendationDto {
  placeId: string;
  name: string;
  reasoningSummary: string;
  transportSummary: string;
  backupOptions: { placeId: string; name: string }[];
}

export interface DetectedPlaceDto {
  name: string;
  confidence: number;
  matchedPlaceId?: string;
  evidence: string[];
}

export class HiddenGemsService {
  private readonly repo: HiddenGemsRepository;
  private readonly extractor: ContentExtractionProvider;
  private readonly now: Date;

  constructor(deps: HiddenGemsServiceDeps & { env: AppEnv["Bindings"] }) {
    this.repo = deps.repository ?? createHiddenGemsRepository(deps.env);
    this.extractor = deps.extractor ?? new TextContentExtractor();
    this.now = deps.now ?? new Date();
  }

  private contextFor(
    record: HiddenGemRecord,
    loc?: { lat: number; lng: number },
    extra: Partial<VisitContext> = {},
  ): VisitContext {
    return {
      lat: loc?.lat ?? record.place.lat,
      lng: loc?.lng ?? record.place.lng,
      nowMinuteOfDay: this.now.getHours() * 60 + this.now.getMinutes(),
      nowDayOfWeek: this.now.getDay(),
      ...extra,
    };
  }

  async search(q: HiddenGemSearchQuery): Promise<HiddenGemResult[]> {
    const records = q.city ? await this.repo.listByCity(q.city) : await this.repo.listAll();
    const hasLoc = q.lat !== undefined && q.lng !== undefined;
    const loc = hasLoc ? { lat: q.lat as number, lng: q.lng as number } : undefined;

    const scored = records.map((record) => {
      const score = scoreHiddenGem(record);
      const visit = scoreVisitability(
        record,
        this.contextFor(record, loc, {
          ...(q.travellerType ? { travellerType: q.travellerType } : {}),
          ...(q.budget ? { budget: q.budget } : {}),
          ...(q.mood ? { mood: q.mood } : {}),
        }),
      );
      return { record, score, visit };
    });

    const filtered = scored.filter(({ record, score, visit }) => {
      if (q.category && record.place.category !== q.category) return false;
      if (q.trendStage && score.trendStage !== q.trendStage) return false;
      // Suppression: drop saturated/suppressed unless the caller explicitly asked for that stage.
      if (q.trendStage !== score.trendStage && isSuppressed(record, score.trendStage)) return false;
      if (
        q.avoidSaturated &&
        (score.trendStage === "saturated" || isSuppressed(record, score.trendStage))
      )
        return false;
      if (q.openNow && !visit.openNow) return false;
      if (q.maxCrowdRisk && CROWD_ORDER[visit.crowdRisk] > CROWD_ORDER[q.maxCrowdRisk])
        return false;
      if (loc && q.radius !== undefined) {
        const km = haversineKm(loc.lat, loc.lng, record.place.lat, record.place.lng);
        if (km > q.radius) return false;
      }
      return true;
    });

    filtered.sort((a, b) => b.score.hiddenGemScore - a.score.hiddenGemScore);

    return filtered
      .slice(0, q.limit)
      .map(({ record, score, visit }) => toResult(record, score, visit));
  }

  async trend(placeId: string): Promise<PlaceTrendDto | null> {
    const record = await this.repo.getByPlaceId(placeId);
    if (!record) return null;
    const score = scoreHiddenGem(record);
    const byKey = new Map(score.components.map((c) => [c.key, c.points]));
    const explanation = score.components.map((c) => c.reason);
    explanation.push(`Classified as "${score.trendStage}".`);
    return {
      placeId: record.place.id,
      name: record.place.name,
      trendStage: score.trendStage,
      velocity7d: record.signal.velocity7d,
      velocity30d: record.signal.velocity30d,
      socialVelocityScore: byKey.get("socialVelocity") ?? 0,
      saturationPenalty: byKey.get("saturationPenalty") ?? 0,
      mainstreamCoveragePenalty: byKey.get("mainstreamCoveragePenalty") ?? 0,
      mapsMaturityPenalty: byKey.get("mapsMaturityPenalty") ?? 0,
      localnessScore: byKey.get("localness") ?? 0,
      confidence: score.confidence,
      explanation,
    };
  }

  async recommendNow(input: RecommendNowRequest): Promise<RecommendationDto[]> {
    const records = await this.repo.listAll();
    const loc = { lat: input.lat, lng: input.lng };
    const avoidCrowds = input.avoid?.includes("crowds") ?? false;

    const scored = records
      .map((record) => {
        const score = scoreHiddenGem(record);
        const visit = scoreVisitability(
          record,
          this.contextFor(record, loc, {
            ...(input.availableTimeMinutes !== undefined
              ? { availableTimeMinutes: input.availableTimeMinutes }
              : {}),
            ...(input.weather ? { weather: input.weather } : {}),
            ...(input.travellerType ? { travellerType: input.travellerType } : {}),
            ...(input.budget ? { budget: input.budget } : {}),
            ...(input.mood ? { mood: input.mood } : {}),
            ...(input.avoid ? { avoid: input.avoid } : {}),
          }),
        );
        const km = haversineKm(loc.lat, loc.lng, record.place.lat, record.place.lng);
        return { record, score, visit, km };
      })
      // Never recommend a saturated/suppressed place as a hidden gem.
      .filter(
        ({ record, score }) =>
          !isSuppressed(record, score.trendStage) && score.trendStage !== "saturated",
      )
      // Respect the available-time budget via a rough 12 km/h walking+transit reach.
      .filter(
        ({ km }) =>
          input.availableTimeMinutes === undefined || km <= (input.availableTimeMinutes / 60) * 12,
      );

    const combined = ({
      score,
      visit,
    }: {
      score: HiddenGemScoreResult;
      visit: VisitabilityScoreResult;
    }): number => 0.5 * score.hiddenGemScore + 0.5 * visit.visitNowScore;

    scored.sort((a, b) => {
      const crowdPenalty = (x: typeof a): number =>
        avoidCrowds ? CROWD_ORDER[x.visit.crowdRisk] * 4 : 0;
      return combined(b) - crowdPenalty(b) - (combined(a) - crowdPenalty(a));
    });

    const top = scored.slice(0, input.limit);
    return top.map(({ record, score, visit, km }, i) => ({
      placeId: record.place.id,
      name: record.place.name,
      reasoningSummary: buildReasoning(record, score, visit),
      transportSummary: `${km.toFixed(1)} km away${
        input.availableTimeMinutes ? `, comfortably within ${input.availableTimeMinutes} min` : ""
      }${visit.openNow ? ", open now" : ""}`,
      backupOptions: top
        .filter((_, j) => j !== i)
        .slice(0, 2)
        .map((o) => ({ placeId: o.record.place.id, name: o.record.place.name })),
    }));
  }

  async resolveSocialPost(input: ResolveSocialPostRequest): Promise<DetectedPlaceDto[]> {
    const candidates = this.extractor.extract({
      ...(input.caption ? { caption: input.caption } : {}),
      ...(input.comments ? { comments: input.comments } : {}),
    });
    const places = await this.repo.listAll();

    return candidates.map((cand) => {
      const needle = cand.name.toLowerCase();
      const match = places.find((p) => {
        const name = p.place.name.toLowerCase();
        return name.includes(needle) || needle.includes(name);
      });
      const evidence = [...cand.evidence];
      let confidence = cand.confidence;
      if (match) {
        confidence = Math.min(1, confidence + 0.2);
        evidence.push(`matched seeded place ${match.place.name}`);
      }
      const dto: DetectedPlaceDto = {
        name: cand.name,
        confidence: Number(confidence.toFixed(2)),
        evidence,
      };
      if (match) dto.matchedPlaceId = match.place.id;
      return dto;
    });
  }
}

export function buildHiddenGemsService(
  env: AppEnv["Bindings"],
  deps: HiddenGemsServiceDeps = {},
): HiddenGemsService {
  return new HiddenGemsService({ env, ...deps });
}

// ── DTO mapping helpers ──────────────────────────────────────────────────────

function toResult(
  record: HiddenGemRecord,
  score: HiddenGemScoreResult,
  visit: VisitabilityScoreResult,
): HiddenGemResult {
  const base: HiddenGemResult = {
    placeId: record.place.id,
    name: record.place.name,
    category: record.place.category,
    lat: record.place.lat,
    lng: record.place.lng,
    hiddenGemScore: score.hiddenGemScore,
    trendStage: score.trendStage,
    visitNowScore: visit.visitNowScore,
    crowdRisk: visit.crowdRisk,
    bestVisitWindow: visit.bestVisitWindow,
    confidence: score.confidence,
    whyNow: buildWhyNow(record, score),
    evidence: buildEvidence(record),
  };
  if (record.place.neighbourhood) base.neighbourhood = record.place.neighbourhood;
  return base;
}

function buildWhyNow(record: HiddenGemRecord, score: HiddenGemScoreResult): string[] {
  const why = score.components
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((c) => c.reason);
  if (!record.place.mainstreamCovered) why.push("Low mainstream coverage");
  return [...new Set(why)].slice(0, 4);
}

function buildEvidence(record: HiddenGemRecord): HiddenGemResult["evidence"] {
  const s = record.signal;
  const p = record.place;
  return {
    socialVelocity: `${s.velocity7d.toFixed(0)}/day (7d) vs ${s.velocity30d.toFixed(0)}/day (30d)`,
    mapsMaturity: `${p.reviewCount ?? 0} Google reviews`,
    creatorDensity: `${Math.round(s.creatorDensity * 100)}% creator density`,
    touristSaturation: `${Math.round(s.touristCreatorRatio * 100)}% tourist creators`,
  };
}

function buildReasoning(
  record: HiddenGemRecord,
  score: HiddenGemScoreResult,
  visit: VisitabilityScoreResult,
): string {
  const bits: string[] = [];
  bits.push(visit.openNow ? "Open now" : "Opening soon");
  bits.push(`${score.trendStage.replace(/_/g, " ")}`);
  if (
    record.place.category === "cafe" ||
    record.place.category === "food" ||
    record.place.category === "culture"
  )
    bits.push("indoor-friendly");
  bits.push(`crowd risk ${visit.crowdRisk.replace(/_/g, " ")}`);
  return bits.join(", ");
}

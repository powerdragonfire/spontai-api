import { describe, expect, it } from "bun:test";
import {
  clamp,
  classifyTrendStage,
  computeConfidence,
  computeHiddenGemScore,
  estimateCrowdRisk,
  haversineKm,
  isOpenAt,
  isSuppressed,
  normalise,
  rotationHash,
  scoreHiddenGem,
  scoreVisitability,
  type TrendInputs,
} from "../../../src/lib/hidden-gems/scoring";
import type {
  HiddenGemRecord,
  PlaceTrendSignal,
  ResolvedPlace,
  VisitContext,
} from "../../../src/types/hidden-gems";

function makePlace(overrides: Partial<ResolvedPlace> = {}): ResolvedPlace {
  return {
    id: "place_1",
    googlePlaceId: "gp_1",
    name: "Test Cafe",
    city: "London",
    neighbourhood: "Peckham",
    category: "cafe",
    lat: 51.5072,
    lng: -0.1276,
    rating: 4.6,
    reviewCount: 120,
    openingHours: [
      [], // Sun closed
      [{ openMin: 8 * 60, closeMin: 17 * 60 }],
      [{ openMin: 8 * 60, closeMin: 17 * 60 }],
      [{ openMin: 8 * 60, closeMin: 17 * 60 }],
      [{ openMin: 8 * 60, closeMin: 17 * 60 }],
      [{ openMin: 8 * 60, closeMin: 17 * 60 }],
      [], // Sat closed
    ],
    priceLevel: "low",
    mainstreamCovered: false,
    ...overrides,
  };
}

function makeSignal(overrides: Partial<PlaceTrendSignal> = {}): PlaceTrendSignal {
  return {
    resolvedPlaceId: "place_1",
    platform: "tiktok",
    mentionCount7d: 20,
    mentionCount30d: 28,
    velocity7d: 20,
    velocity30d: 6,
    engagementScore: 0.7,
    saveIntentScore: 0.6,
    commentIntentScore: 0.5,
    creatorDensity: 0.2,
    localCreatorRatio: 0.7,
    touristCreatorRatio: 0.1,
    firstSeenAt: "2026-05-01T00:00:00Z",
    lastSeenAt: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

function makeRecord(
  place: Partial<ResolvedPlace> = {},
  signal: Partial<PlaceTrendSignal> = {},
): HiddenGemRecord {
  return { place: makePlace(place), signal: makeSignal(signal) };
}

function makeCtx(overrides: Partial<VisitContext> = {}): VisitContext {
  return {
    lat: 51.5072,
    lng: -0.1276,
    nowMinuteOfDay: 14 * 60, // 14:00
    nowDayOfWeek: 2, // Tuesday
    weather: "clear",
    travellerType: "solo",
    budget: "low",
    ...overrides,
  };
}

const inputs = (o: Partial<TrendInputs> = {}): TrendInputs => ({
  velocity7d: 10,
  velocity30d: 6,
  saturation: 0.2,
  mapsMaturity: 0.1,
  mainstreamCovered: false,
  dataPoints: 5,
  ...o,
});

describe("helpers", () => {
  it("clamp bounds a value", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it("normalise maps to 0..1 against a ceiling", () => {
    expect(normalise(25, 25)).toBe(1);
    expect(normalise(50, 25)).toBe(1);
    expect(normalise(0, 25)).toBe(0);
    expect(normalise(5, 25)).toBeCloseTo(0.2, 5);
  });

  it("haversineKm is ~0 for the same point and positive otherwise", () => {
    expect(haversineKm(51.5, -0.12, 51.5, -0.12)).toBeCloseTo(0, 5);
    expect(haversineKm(51.5, -0.12, 51.6, -0.12)).toBeGreaterThan(10);
  });

  it("rotationHash is deterministic and within 0..1", () => {
    const a = rotationHash("place_1", 0);
    expect(a).toBe(rotationHash("place_1", 0));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
    expect(rotationHash("place_1", 1)).not.toBe(a);
  });
});

describe("computeHiddenGemScore", () => {
  it("rewards a local, rising, low-maturity place", () => {
    const { score, components } = computeHiddenGemScore(makeRecord());
    expect(score).toBeGreaterThan(50);
    expect(components).toHaveLength(8);
    expect(components.find((c) => c.key === "socialVelocity")?.points).toBeGreaterThan(0);
    expect(components.find((c) => c.key === "mapsMaturityPenalty")?.points).toBeLessThan(0);
  });

  it("clamps to 0..100 for an extreme saturated place", () => {
    const { score } = computeHiddenGemScore(
      makeRecord(
        { reviewCount: 50_000, mainstreamCovered: true },
        { creatorDensity: 1, touristCreatorRatio: 1, velocity7d: 0, localCreatorRatio: 0 },
      ),
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("classifyTrendStage (your implementation)", () => {
  it("undiscovered when there is too little data", () => {
    expect(classifyTrendStage(inputs({ dataPoints: 1 }))).toBe("undiscovered");
  });

  it("early_rising in the sweet spot: rising velocity, low saturation, low maturity", () => {
    expect(classifyTrendStage(inputs({ velocity7d: 10, saturation: 0.2, mapsMaturity: 0.1 }))).toBe(
      "early_rising",
    );
  });

  it("peaking when velocity is strong but saturation is climbing (medium band)", () => {
    expect(
      classifyTrendStage(inputs({ velocity7d: 14, saturation: 0.55, mapsMaturity: 0.3 })),
    ).toBe("peaking");
  });

  it("saturated when creator saturation is high", () => {
    expect(classifyTrendStage(inputs({ saturation: 0.8 }))).toBe("saturated");
  });

  it("saturated when Google maps maturity is high", () => {
    expect(classifyTrendStage(inputs({ saturation: 0.2, mapsMaturity: 0.8 }))).toBe("saturated");
  });

  it("saturated when mainstream-covered", () => {
    expect(
      classifyTrendStage(inputs({ saturation: 0.2, mapsMaturity: 0.1, mainstreamCovered: true })),
    ).toBe("saturated");
  });

  it("declining when 7d velocity has fallen well below the 30d baseline", () => {
    expect(
      classifyTrendStage(
        inputs({ velocity7d: 2, velocity30d: 8, saturation: 0.2, mapsMaturity: 0.1 }),
      ),
    ).toBe("declining");
  });
});

describe("computeConfidence", () => {
  it("is low when signals are sparse", () => {
    const c = computeConfidence(
      makeRecord(
        {},
        {
          velocity7d: 0,
          engagementScore: 0,
          saveIntentScore: 0,
          commentIntentScore: 0,
          localCreatorRatio: 0,
          mentionCount30d: 1,
        },
      ),
    );
    expect(c).toBeLessThan(0.3);
  });

  it("is higher when signals are rich and the place resolved on Google", () => {
    expect(computeConfidence(makeRecord())).toBeGreaterThan(0.5);
  });
});

describe("scoreVisitability", () => {
  it("flags open-now inside opening hours and closed outside", () => {
    expect(isOpenAt(makePlace(), 2, 14 * 60)).toBe(true);
    expect(isOpenAt(makePlace(), 2, 20 * 60)).toBe(false);
    expect(isOpenAt(makePlace(), 0, 14 * 60)).toBe(false); // Sunday closed
  });

  it("gives a high visitNowScore for a close, open, low-crowd place", () => {
    const r = scoreVisitability(makeRecord(), makeCtx());
    expect(r.openNow).toBe(true);
    expect(r.visitNowScore).toBeGreaterThan(50);
    expect(r.components).toHaveLength(6);
  });

  it("buckets crowd risk as unknown when data is too sparse", () => {
    const risk = estimateCrowdRisk(
      makeRecord(
        {},
        {
          velocity7d: 0,
          engagementScore: 0,
          saveIntentScore: 0,
          commentIntentScore: 0,
          localCreatorRatio: 0,
        },
      ),
      makeCtx(),
    );
    expect(risk).toBe("unknown");
  });

  it("rates a busy tourist-heavy place as higher crowd risk", () => {
    const risk = estimateCrowdRisk(
      makeRecord({}, { creatorDensity: 0.9, touristCreatorRatio: 0.9 }),
      makeCtx({ nowDayOfWeek: 6, nowMinuteOfDay: 20 * 60 }),
    );
    expect(["medium_to_high", "high"]).toContain(risk);
  });
});

describe("scoreHiddenGem + suppression", () => {
  it("suppresses a saturated place", () => {
    const saturated = makeRecord(
      { reviewCount: 50_000, mainstreamCovered: true },
      { creatorDensity: 0.9 },
    );
    const result = scoreHiddenGem(saturated);
    expect(result.trendStage).toBe("saturated");
    expect(isSuppressed(saturated, result.trendStage)).toBe(true);
  });

  it("does not suppress an early_rising place", () => {
    const rising = makeRecord();
    const result = scoreHiddenGem(rising);
    expect(result.trendStage).toBe("early_rising");
    expect(isSuppressed(rising, result.trendStage)).toBe(false);
  });
});

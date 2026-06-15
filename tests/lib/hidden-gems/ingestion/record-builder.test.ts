import { describe, expect, it } from "bun:test";
import { buildRecord } from "@/lib/hidden-gems/ingestion/record-builder";
import type { HiddenGemCandidate } from "@/types/ingestion";

const NORMAS: HiddenGemCandidate = {
  id: "run_001_1",
  placeNameRaw: "Norma's Coffee",
  city: "London",
  sourcePlatform: "tiktok",
  status: "unresolved",
  confidence: 0.72,
  evidence: ["caption mention"],
  extractedSignals: {
    mentionCount7d: 21,
    velocity7d: 18,
    saveIntentScore: 0.64,
    commentIntentScore: 0.58,
    localCreatorRatio: 0.78,
  },
};

const NOW = new Date("2026-06-09T12:00:00Z");

describe("buildRecord", () => {
  it("generates a stable place ID from city + name slug", () => {
    const record = buildRecord(NORMAS, NOW);
    expect(record.place.id).toBe("lon_ing_norma_s_coffee");
  });

  it("uses city centroid for lat/lng when no coords available", () => {
    const record = buildRecord(NORMAS, NOW);
    // London centroid ≈ 51.5074, -0.1278
    expect(record.place.lat).toBeCloseTo(51.5074, 2);
    expect(record.place.lng).toBeCloseTo(-0.1278, 2);
  });

  it("copies city and name from candidate", () => {
    const record = buildRecord(NORMAS, NOW);
    expect(record.place.city).toBe("London");
    expect(record.place.name).toBe("Norma's Coffee");
  });

  it("wires extracted signals into place signal", () => {
    const record = buildRecord(NORMAS, NOW);
    expect(record.signal.mentionCount7d).toBe(21);
    expect(record.signal.velocity7d).toBe(18);
    expect(record.signal.saveIntentScore).toBe(0.64);
  });

  it("resolvedPlaceId on signal matches place.id", () => {
    const record = buildRecord(NORMAS, NOW);
    expect(record.signal.resolvedPlaceId).toBe(record.place.id);
  });
});

import { describe, expect, it } from "bun:test";
import { estimateSignal } from "@/lib/hidden-gems/ingestion/signal-estimator";
import type { HiddenGemCandidate } from "@/types/ingestion";

const BASE: HiddenGemCandidate = {
  id: "run_001_1",
  placeNameRaw: "Norma's Coffee",
  city: "London",
  sourcePlatform: "tiktok",
  status: "unresolved",
  confidence: 0.72,
  evidence: ["caption mention"],
};

const NOW = new Date("2026-06-09T12:00:00Z");

describe("estimateSignal", () => {
  it("merges extracted signals with defaults", () => {
    const candidate: HiddenGemCandidate = {
      ...BASE,
      extractedSignals: {
        mentionCount7d: 21,
        velocity7d: 18,
        saveIntentScore: 0.64,
      },
    };
    const signal = estimateSignal(candidate, "lon_ing_norma", NOW);
    expect(signal.mentionCount7d).toBe(21);
    expect(signal.velocity7d).toBe(18);
    expect(signal.saveIntentScore).toBe(0.64);
    // Fields not in extractedSignals fall back to defaults
    expect(signal.commentIntentScore).toBe(0.2);
  });

  it("uses full defaults when extractedSignals is undefined", () => {
    const signal = estimateSignal(BASE, "lon_test", NOW);
    expect(signal.mentionCount7d).toBe(5);
    expect(signal.velocity7d).toBe(3);
    expect(signal.engagementScore).toBe(0.4);
  });

  it("firstSeenAt is exactly 7 days before lastSeenAt", () => {
    const signal = estimateSignal(BASE, "lon_test", NOW);
    const diff = new Date(signal.lastSeenAt).getTime() - new Date(signal.firstSeenAt).getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("resolvedPlaceId and platform are set correctly", () => {
    const signal = estimateSignal(BASE, "lon_ing_norma", NOW);
    expect(signal.resolvedPlaceId).toBe("lon_ing_norma");
    expect(signal.platform).toBe("tiktok");
  });
});

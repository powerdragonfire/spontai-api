import { expect, test } from "bun:test";
import type { HiddenGemCandidate, RawSignalData } from "@/types/ingestion";

test("HiddenGemCandidate can be constructed with required fields only", () => {
  const c: HiddenGemCandidate = {
    id: "run_001_1",
    placeNameRaw: "Norma's Coffee",
    city: "London",
    sourcePlatform: "tiktok",
    status: "unresolved",
    confidence: 0.72,
    evidence: ["caption mention"],
  };
  expect(c.status).toBe("unresolved");
  expect(c.confidence).toBeLessThanOrEqual(1);
  expect(c.city).toBe("London");
});

test("HiddenGemCandidate accepts extractedSignals", () => {
  const signals: Partial<RawSignalData> = {
    mentionCount7d: 21,
    velocity7d: 18.5,
    saveIntentScore: 0.64,
  };
  const c: HiddenGemCandidate = {
    id: "run_001_2",
    placeNameRaw: "Silo Bakehouse",
    city: "London",
    sourcePlatform: "instagram",
    status: "unresolved",
    confidence: 0.55,
    evidence: [],
    extractedSignals: signals,
  };
  expect(c.extractedSignals?.velocity7d).toBe(18.5);
});

test("CandidateStatus covers all expected values", () => {
  const statuses: import("@/types/ingestion").CandidateStatus[] = [
    "unresolved",
    "resolved",
    "rejected",
    "needs_review",
  ];
  expect(statuses.length).toBe(4);
});

// src/lib/hidden-gems/ingestion/signal-estimator.ts
// Converts a HiddenGemCandidate's partial signal data into a full PlaceTrendSignal
// by merging with safe defaults. All fields are estimates; Google Places + live
// social provider will overwrite them in later phases.

import type { PlaceTrendSignal } from "@/types/hidden-gems";
import type { HiddenGemCandidate, RawSignalData } from "@/types/ingestion";

const DEFAULTS: RawSignalData = {
  mentionCount7d: 5,
  mentionCount30d: 12,
  velocity7d: 3,
  velocity30d: 1.5,
  engagementScore: 0.4,
  saveIntentScore: 0.25,
  commentIntentScore: 0.2,
  creatorDensity: 0.2,
  localCreatorRatio: 0.5,
  touristCreatorRatio: 0.2,
};

export function estimateSignal(
  candidate: HiddenGemCandidate,
  resolvedPlaceId: string,
  now: Date,
): PlaceTrendSignal {
  const s: RawSignalData = { ...DEFAULTS, ...candidate.extractedSignals };
  const lastSeenAt = now.toISOString();
  const firstSeenAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    resolvedPlaceId,
    platform: candidate.sourcePlatform,
    mentionCount7d: s.mentionCount7d,
    mentionCount30d: s.mentionCount30d,
    velocity7d: s.velocity7d,
    velocity30d: s.velocity30d,
    engagementScore: s.engagementScore,
    saveIntentScore: s.saveIntentScore,
    commentIntentScore: s.commentIntentScore,
    creatorDensity: s.creatorDensity,
    localCreatorRatio: s.localCreatorRatio,
    touristCreatorRatio: s.touristCreatorRatio,
    firstSeenAt,
    lastSeenAt,
  };
}

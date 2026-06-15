// src/lib/hidden-gems/ingestion/record-builder.ts
// Assembles a HiddenGemRecord from a HiddenGemCandidate.
// Uses city centroid for lat/lng until Google Places provides real coordinates (Phase 3b).
// Place IDs are deterministic slugs — re-ingesting the same candidate produces the same ID.

import { cityCentroid } from "@/lib/hidden-gems/ingestion/city-centroids";
import { estimateSignal } from "@/lib/hidden-gems/ingestion/signal-estimator";
import type { HiddenGemRecord, PlaceCategory } from "@/types/hidden-gems";
import type { HiddenGemCandidate } from "@/types/ingestion";

const DEFAULT_CATEGORY: PlaceCategory = "food";

function placeIdFromCandidate(candidate: HiddenGemCandidate): string {
  const slug = candidate.placeNameRaw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  const cityPrefix = candidate.city.toLowerCase().slice(0, 3);
  return `${cityPrefix}_ing_${slug}`;
}

export function buildRecord(candidate: HiddenGemCandidate, now: Date): HiddenGemRecord {
  const placeId = placeIdFromCandidate(candidate);
  const coords = cityCentroid(candidate.city);
  const signal = estimateSignal(candidate, placeId, now);

  return {
    place: {
      id: placeId,
      name: candidate.placeNameRaw,
      city: candidate.city,
      ...(candidate.neighbourhood ? { neighbourhood: candidate.neighbourhood } : {}),
      category: candidate.category ?? DEFAULT_CATEGORY,
      lat: coords.lat,
      lng: coords.lng,
    },
    signal,
  };
}

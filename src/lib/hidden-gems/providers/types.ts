// Provider abstraction layer — keep the hidden-gems engine provider-agnostic.
// v1 ships mock/seed + text implementations; real adapters (TikTok Research,
// Instagram Graph, Google Places, BestTime, Foursquare, PredictHQ) implement the
// same interfaces later without touching scoring or routes.

import type { PlaceTrendSignal, ResolvedPlace } from "@/types/hidden-gems";

/** Aggregated social-trend metrics for a place. (TikTok/Instagram adapters later.) */
export interface SocialTrendProvider {
  getSignal(resolvedPlaceId: string): Promise<PlaceTrendSignal | null>;
}

/** Free-text place search → candidate resolved places. (Google/Foursquare later.) */
export interface PlaceSearchProvider {
  search(query: string, city?: string): Promise<ResolvedPlace[]>;
}

/** Authoritative place details / validation. (Google Places in prod.) */
export interface PlaceDetailsProvider {
  getDetails(googlePlaceId: string): Promise<ResolvedPlace | null>;
}

/** Extract candidate place names from social-post text (caption/comments/hashtags). */
export interface ContentExtractionProvider {
  extract(input: ContentExtractionInput): ExtractedCandidate[];
}

export interface ContentExtractionInput {
  caption?: string;
  comments?: string[];
}

export interface ExtractedCandidate {
  name: string;
  /** 0..1 — rises with the number of independent evidence sources. */
  confidence: number;
  evidence: string[];
}

// ── future providers (interfaces only in v1) ─────────────────────────────────

/** Venue busyness / foot traffic. TODO: BestTime.app adapter. */
export interface FootTrafficProvider {
  getBusyness(googlePlaceId: string, dayOfWeek: number, hour: number): Promise<number | null>;
}

/** Weather context for visitability. TODO: weather provider adapter. */
export interface WeatherProvider {
  getCurrent(lat: number, lng: number): Promise<string | null>;
}

/** Local events / date context. TODO: PredictHQ adapter. */
export interface EventContextProvider {
  getEvents(lat: number, lng: number, when: string): Promise<unknown[]>;
}

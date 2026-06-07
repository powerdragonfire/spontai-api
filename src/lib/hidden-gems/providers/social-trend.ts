// Social-trend signal provider.
//
// v1 is mock/seed-backed: there is no live TikTok Research / Instagram Graph access
// yet. Real adapters implement the same SocialTrendProvider interface later and feed
// the raw-ingestion path (kept separate from user-facing recommendations).

import type { SocialTrendProvider } from "@/lib/hidden-gems/providers/types";
import type { PlaceTrendSignal } from "@/types/hidden-gems";

export class MockSocialTrendProvider implements SocialTrendProvider {
  private readonly byPlace: Map<string, PlaceTrendSignal>;

  constructor(signals: readonly PlaceTrendSignal[]) {
    this.byPlace = new Map(signals.map((s) => [s.resolvedPlaceId, s]));
  }

  getSignal(resolvedPlaceId: string): Promise<PlaceTrendSignal | null> {
    return Promise.resolve(this.byPlace.get(resolvedPlaceId) ?? null);
  }
}

// TODO(future): TikTokResearchTrendProvider, InstagramGraphTrendProvider —
// aggregate public metadata into PlaceTrendSignal. Store only aggregated signals,
// never raw scraped personal data; respect each platform's ToS + rate limits
// (e.g. Instagram's 30 unique hashtags / rolling 7 days cap).

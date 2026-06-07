// PlaceSearch + PlaceDetails providers.
//
// GooglePlacesProvider is the production place-of-truth adapter. It is deliberately
// left unimplemented in this slice: wiring live Google Places is an approval-gated
// step (needs GOOGLE_PLACES_API_KEY in wrangler.toml + AppEnv bindings). When built,
// every call MUST go through withBreadcrumb("google_places_*", ...).
//
// FakePlaceProvider backs the in-memory slice and hermetic tests — same interface,
// no network, no cost.

import type { PlaceDetailsProvider, PlaceSearchProvider } from "@/lib/hidden-gems/providers/types";
import type { ResolvedPlace } from "@/types/hidden-gems";

export class GooglePlacesProvider implements PlaceSearchProvider, PlaceDetailsProvider {
  constructor(private readonly apiKey: string) {}

  search(_query: string, _city?: string): Promise<ResolvedPlace[]> {
    // TODO(gated): Places Text Search (POST /v1/places:searchText) via withBreadcrumb.
    void this.apiKey;
    return Promise.reject(new Error("GooglePlacesProvider.search not implemented (gated)"));
  }

  getDetails(_googlePlaceId: string): Promise<ResolvedPlace | null> {
    // TODO(gated): Place Details (GET /v1/places/{id}) via withBreadcrumb.
    return Promise.reject(new Error("GooglePlacesProvider.getDetails not implemented (gated)"));
  }
}

/** In-memory place provider over a fixed set — used by the slice and tests. */
export class FakePlaceProvider implements PlaceSearchProvider, PlaceDetailsProvider {
  constructor(private readonly places: readonly ResolvedPlace[]) {}

  search(query: string, city?: string): Promise<ResolvedPlace[]> {
    const q = query.trim().toLowerCase();
    const matches = this.places.filter((p) => {
      if (city && p.city.toLowerCase() !== city.toLowerCase()) return false;
      const hay = `${p.name} ${p.neighbourhood ?? ""}`.toLowerCase();
      return hay.includes(q) || q.includes(p.name.toLowerCase());
    });
    return Promise.resolve(matches);
  }

  getDetails(googlePlaceId: string): Promise<ResolvedPlace | null> {
    return Promise.resolve(this.places.find((p) => p.googlePlaceId === googlePlaceId) ?? null);
  }
}

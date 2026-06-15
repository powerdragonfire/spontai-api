// src/lib/hidden-gems/ingestion/city-centroids.ts
// Approximate city centres used for ingested candidates that have not yet been
// resolved against Google Places (which provides real per-place lat/lng).
// Phase 3b will overwrite these with Google Place coordinates.

interface Coords {
  lat: number;
  lng: number;
}

const CENTROIDS: Record<string, Coords> = {
  london: { lat: 51.5074, lng: -0.1278 },
  paris: { lat: 48.8566, lng: 2.3522 },
  amsterdam: { lat: 52.3676, lng: 4.9041 },
  barcelona: { lat: 41.3874, lng: 2.1686 },
  berlin: { lat: 52.52, lng: 13.405 },
  rome: { lat: 41.9028, lng: 12.4964 },
  lisbon: { lat: 38.7169, lng: -9.1399 },
  tokyo: { lat: 35.6762, lng: 139.6503 },
  newyork: { lat: 40.7128, lng: -74.006 },
  new_york: { lat: 40.7128, lng: -74.006 },
  sydney: { lat: -33.8688, lng: 151.2093 },
  melbourne: { lat: -37.8136, lng: 144.9631 },
};

export function cityCentroid(city: string): Coords {
  const key = city.trim().toLowerCase().replace(/\s+/g, "_");
  return CENTROIDS[key] ?? { lat: 0, lng: 0 };
}

export const SCOPES = [
  "me:read",
  "countries:read",
  "places:read",
  "trips:read",
  "taste:read",
  "recommendations:read",
  "feed:read",
  "hidden_gems:read",
] as const;

export type KnownScope = (typeof SCOPES)[number];

// hidden_gems:read exposes only aggregated, non-personal place intelligence, so
// partner agents (the B2A consumers) may hold it directly via an API key — unlike
// user-owned scopes (trips:read, …) which are issuable only through OAuth.
export const API_KEY_ALLOWED_SCOPES: readonly KnownScope[] = [
  "feed:read",
  "hidden_gems:read",
] as const;

export function isApiKeyAllowedScope(s: string): s is KnownScope {
  return (API_KEY_ALLOWED_SCOPES as readonly string[]).includes(s);
}

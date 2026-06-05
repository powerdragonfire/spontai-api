export const SCOPES = [
  "me:read",
  "countries:read",
  "places:read",
  "trips:read",
  "taste:read",
  "recommendations:read",
  "feed:read",
] as const;

export type KnownScope = (typeof SCOPES)[number];

export const API_KEY_ALLOWED_SCOPES: readonly KnownScope[] = ["feed:read"] as const;

export function isApiKeyAllowedScope(s: string): s is KnownScope {
  return (API_KEY_ALLOWED_SCOPES as readonly string[]).includes(s);
}

# Phase 2 — Auth foundation design

**Status:** approved (2026-05-02)
**Phase:** 2 of 7
**Scope:** verifier-side auth middleware + scope enforcement + Sentry context. Issuer-side endpoints (`/oauth/*`) are explicitly deferred.
**Test gate:** ≥14 tests passing, 0 failing at end of phase (target: 18).

---

## 1. Goal

Spontai-api needs a way to authenticate two kinds of callers and enforce scope-based authorization, *before* Phase 3 ships any real route handlers.

The two caller types:

- **Agents acting on behalf of an end user** — authenticated via OAuth 2.1 + PKCE flow (issuance deferred). They present `Authorization: Bearer <jwt>` where the JWT was issued by spontai-api with a user `sub` and a list of granted scopes.
- **Partner organizations** — authenticated via long-lived HS256-signed API keys. They present `Authorization: ApiKey <jwt>`. Partner keys are restricted to public/aggregate scopes only (v1: just `feed:read`); they cannot read user-owned data without OAuth delegation.

By the end of Phase 2, every Phase 3+ route can declare a single required scope via `requireScope("X")` and trust that:

- the request has a valid token of one of the two types,
- the token's `scope` claim covers the required scope,
- the request has Sentry context tagged with the request's identity, and
- external calls inside the handler can use a `withBreadcrumb()` helper that satisfies CLAUDE.md's mandated Sentry pattern.

## 2. Out of scope (deferred)

- `/oauth/authorize`, `/oauth/token`, `/oauth/revoke` HTTP endpoints
- Consent screen UI
- The user-authentication-on-consent-screen question (Supabase magic link vs universal-link bounce vs web sign-in)
- Refresh-token issuance and storage in Upstash
- `workers-oauth-provider` integration (lands when issuer endpoints are built)
- Partner key issuance tooling (admin script)
- Production secret provisioning via `wrangler secret put`
- Rate limiting (Cloudflare Rate Limiting + Upstash; comes alongside route handlers)

## 3. Decisions made (brainstorm summary)

| # | Decision | Choice |
|---|---|---|
| Q1 | OAuth provider responsibility | **A** — this Worker is the authorization server (issuer endpoints in a later phase) |
| Q2 | Scope vocabulary | **B** — per-resource scopes, 7 in v1 |
| Q3 | Access-token format | **A** — short-lived (15 min) HS256 JWT + opaque refresh tokens in Upstash |
| Q4 | Partner API keys | **A** — restricted to public scopes only (`feed:read` in v1) |
| Q5 | Phase 2 scope | **A** — verifiers + middleware + Sentry; defer issuer endpoints + consent UI |

## 4. Architecture

### 4.1 Per-request flow on a protected route

```
GET /v1/trips
  Authorization: Bearer eyJ...

[1] sentryContext()             — global, applied via app.use("*", ...)
       └─ initializes per-request Sentry scope, tags { method, route }

[2] requireScope("trips:read")  — applied per route
       ├─ verifyAuth(c)         — 401 if invalid; populates c.var.auth
       │   └─ on success: Sentry sets user/scope tags
       └─ scope check           — 403 if "trips:read" not in c.var.auth.scopes

[3] route handler
       └─ reads c.var.auth.sub (typed as string via discriminated-union narrowing)
```

Public routes (no `requireScope`) skip steps 2 entirely. `c.var.auth` is undefined for them.

### 4.2 File inventory

```
src/
├── lib/
│   ├── scopes.ts          # SCOPES const, KnownScope type, API_KEY_ALLOWED_SCOPES
│   ├── upstash.ts         # @upstash/redis client factory; no Phase 2 callers
│   └── test-tokens.ts     # Re-exports the test-helpers used by tests/_helpers/env.ts
├── middleware/
│   ├── auth.ts            # verifyAuth(c) — verifies Bearer or ApiKey, populates c.var.auth
│   ├── scope.ts           # requireScope(scope) middleware factory
│   └── sentry.ts          # sentryContext() middleware + withBreadcrumb() helper
├── types/
│   ├── auth.ts            # AuthContext discriminated union
│   └── hono.ts            # AppEnv (Bindings + Variables)
└── index.ts               # MODIFIED — Hono app wrapped with Sentry.withSentry; sentryContext applied

tests/
├── _helpers/
│   └── env.ts             # TEST_HMAC_SECRET, mintTestAccessToken, mintTestApiKey, testEnv
└── middleware/
    ├── auth.test.ts       # 11 tests
    ├── scope.test.ts      #  4 tests
    └── sentry.test.ts     #  2 tests
```

### 4.3 New dependency

`jose` — JWT verify/sign library. Runs on Workers via Web Crypto. Used by `auth.ts` (verify) and `tests/_helpers/env.ts` (sign). Approved during brainstorm. (CLAUDE.md's locked-list addition needs to be reflected; will be done in implementation plan.)

## 5. Token formats

### 5.1 OAuth access token — `Authorization: Bearer …`

Lifetime: **15 minutes**.

**Header:** `{ alg: "HS256", typ: "JWT", kid: "v1" }`

**Payload:**
```json
{
  "iss": "spontai-api",
  "aud": "spontai-api",
  "iat": 1746205200,
  "exp": 1746206100,
  "jti": "01JXY...ULID",
  "kind": "oauth_access",
  "sub": "user_<supabase_uuid>",
  "client_id": "agent_<id>",
  "scope": "trips:read places:read"
}
```

### 5.2 Partner API key — `Authorization: ApiKey …`

Lifetime: **365 days**, manual rotation. Pre-expiry revocation via future `jti` denylist.

**Header:** identical (`HS256` + `kid: "v1"`).

**Payload:**
```json
{
  "iss": "spontai-api",
  "aud": "spontai-api",
  "iat": 1746205200,
  "exp": 1777741200,
  "jti": "01JXY...ULID",
  "kind": "api_key",
  "sub": "partner_<id>",
  "scope": "feed:read"
}
```

`sub` always carries a `partner_` prefix to enforce no overlap with user IDs.

### 5.3 Verification (`auth.ts → verifyAuth`)

```
1. Read Authorization header → 401 if missing
2. Parse scheme: "Bearer" expects kind="oauth_access"
                 "ApiKey" expects kind="api_key"
                 anything else → 401
3. Decode JWT header to read `kid`
   Look up secret in keyMap; unknown kid → 401
4. jose.jwtVerify(token, secret) — throws on bad sig / expired → 401
5. Validate claims:
     iss === "spontai-api"
     aud === "spontai-api"
     kind matches the wire scheme   ← defense-in-depth
     if kind === "api_key": every scope ∈ API_KEY_ALLOWED_SCOPES
6. Populate c.var.auth = { kind, sub, scopes, jti, clientId? }
```

### 5.4 `c.var.auth` type

```ts
export type AuthContext =
  | { kind: "oauth_access"; sub: string; clientId: string; scopes: string[]; jti: string }
  | { kind: "api_key";      sub: string;                    scopes: string[]; jti: string };
```

### 5.5 Key rotation

Phase 2 reads the secret from a kid-keyed map:

```ts
const SIGNING_KEYS: Record<string, string> = {
  v1: env.HMAC_SIGNING_SECRET,
};
```

To rotate: provision `HMAC_SIGNING_SECRET_V2`, register `v2` in the map, switch `mintAccessToken()` to sign with `v2`. Both kids verify in parallel during the cutover. Once all `v1`-signed tokens have expired (≤15 min for access tokens, up to 365 days for API keys), drop `v1`.

The map shape exists from day one so no refactor is needed at rotation time.

### 5.6 Error responses

RFC 6750–shaped JSON:
```json
{ "error": "invalid_token", "error_description": "Token signature is invalid" }
```

| Status | Cause |
|---|---|
| 401 | no auth header, malformed token, bad signature, expired, unknown `kid`, scheme/kind mismatch, `iss`/`aud` mismatch, ApiKey requesting forbidden scope |
| 403 | auth succeeded but route's required scope not in `c.var.auth.scopes` |

## 6. Scope vocabulary

### 6.1 Constants (`src/lib/scopes.ts`)

```ts
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
```

### 6.2 Per-route declaration

```ts
import { requireScope } from "@/middleware/scope";

// Public — no auth, no scope
app.get("/v1/feed/public", handler);

// Auth + scope
app.get("/v1/me",     requireScope("me:read"),    handler);
app.get("/v1/trips",  requireScope("trips:read"), handler);
app.get("/v1/feed",   requireScope("feed:read"),  handler); // either Bearer or ApiKey
```

### 6.3 Forward-compat with Phase 4 (OpenAPI)

`requireScope` calls `c.set("requiredScope", scope)` so Phase 4's OpenAPI generator can read it back and emit `security: [{ OAuth2: [scope] }]` per operation. **Phase 2 doesn't read this metadata anywhere** — it's deposited for later phases.

## 7. Middleware composition

### 7.1 Hono types (`src/types/hono.ts`)

```ts
export type AppEnv = {
  Bindings: {
    HMAC_SIGNING_SECRET: string;
    SENTRY_DSN?: string;
    UPSTASH_REDIS_REST_URL: string;
    UPSTASH_REDIS_REST_TOKEN: string;
  };
  Variables: {
    auth: AuthContext;
    requiredScope?: string;
  };
};
```

### 7.2 `src/index.ts` shape

```ts
import { Hono } from "hono";
import * as Sentry from "@sentry/cloudflare";
import { sentryContext } from "@/middleware/sentry";
import type { AppEnv } from "@/types/hono";

const app = new Hono<AppEnv>();
app.use("*", sentryContext());
app.get("/", (c) => c.json({ ok: true, name: "spontai-api", version: "0.0.1" }));

export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  }),
  app,
);
```

CLAUDE.md's "`export default app`" rule was about not hand-crafting `{ fetch: app.fetch }`; `Sentry.withSentry(opts, app)` returns a properly-shaped `ExportedHandler` and is the canonical wrapper. CLAUDE.md gets a one-line clarification.

### 7.3 Path aliasing

`tsconfig.json` adds `"paths": { "@/*": ["./src/*"] }`. Small change; pays for itself by Phase 3 when many cross-imports exist.

## 8. Sentry pattern

### 8.1 `sentryContext()` middleware

Initializes per-request scope, tags `http.method` + `http.route`. After `next()` returns, if `c.var.auth` is set, also tags `auth.kind`, `auth.client_id`, and `Sentry.setUser({ id: c.var.auth.sub })`.

### 8.2 `withBreadcrumb()` helper

```ts
export async function withBreadcrumb<T>(
  area: string,
  message: string,
  fn: () => Promise<T>,
  data?: Record<string, unknown>,
): Promise<T> {
  Sentry.addBreadcrumb({ category: area, message, level: "info", data });
  try {
    return await fn();
  } catch (error) {
    Sentry.captureException(error, { tags: { area } });
    throw error;
  }
}
```

This is **the convention** for every external call (Supabase, Upstash, Google Places, JWKS). Failing to use it is a code-review issue. CLAUDE.md's mandated `addBreadcrumb + try/catch + captureException` collapses into one call.

### 8.3 Local dev / no DSN

`@sentry/cloudflare`'s `withSentry` no-ops cleanly when `SENTRY_DSN` is empty. Local dev runs without errors and no spans/events leave the machine. Tests run with no DSN and use a mocked Sentry module to assert helper behavior.

## 9. Test strategy

### 9.1 Helpers — `tests/_helpers/env.ts`

Exports `TEST_HMAC_SECRET`, `mintTestAccessToken({ sub, scopes, clientId?, expiresInSec? })`, `mintTestApiKey({ sub, scopes })`, and `testEnv()` returning a fake bindings object.

`src/lib/test-tokens.ts` re-exports these for symmetry, but **production code paths must not import it**. The defense is a convention enforced by code review + a deliberate file naming pattern (`test-tokens.ts` is loud enough that an accidental import is obvious in PR diffs). No runtime tripwire — Workers don't expose a reliable "NODE_ENV-style" signal, and a check that only fires in tests provides no real protection.

### 9.2 Test files & scenarios

**`tests/middleware/auth.test.ts` — 11 tests:**

1. No `Authorization` header → 401
2. Authorization with no recognized scheme → 401
3. `Bearer` followed by garbage (not a JWT) → 401
4. `Bearer` JWT signed with wrong secret → 401
5. `Bearer` JWT, valid signature, `exp` in past → 401
6. `Bearer` JWT, valid signature, `iss` ≠ `"spontai-api"` → 401
7. `Bearer` JWT with `kind: "api_key"` (mismatch) → 401
8. `ApiKey` JWT with `kind: "oauth_access"` (mismatch) → 401
9. Valid `Bearer` + correct scope → 200, `c.var.auth.kind === "oauth_access"`
10. Valid `ApiKey` with `scope: "feed:read"` → accepted at verify
11. `ApiKey` requesting `trips:read` (forbidden by allowlist) → 401

**`tests/middleware/scope.test.ts` — 4 tests:**

12. Valid auth, route requires `trips:read`, token has `["places:read"]` → 403
13. Valid auth, route requires `trips:read`, token has `["trips:read"]` → 200
14. Valid auth, route requires `feed:read`, token has `["feed:read", "places:read"]` → 200
15. Public route (no `requireScope`) returns 200 even without auth header

**`tests/middleware/sentry.test.ts` — 2 tests:**

16. `withBreadcrumb` resolves to fn's return value on success; addBreadcrumb called once
17. `withBreadcrumb` calls `captureException` with `{ tags: { area } }` and rethrows

### 9.3 Phase exit gate

- **Floor:** ≥14 tests passing, 0 failing
- **Target:** 18 tests passing, 0 failing (Phase 1's 1 + Phase 2's 17)
- `bunx tsc --noEmit` → 0 errors
- `bunx biome check .` → 0 errors
- `bun test` → 0 failures

## 10. CLAUDE.md changes

Tiny additions (handled in implementation plan):

- **New convention:** "JWT signing keys carry `kid: \"v1\"` headers; `src/middleware/auth.ts` reads the secret via a `kid`-keyed map. To rotate, provision `HMAC_SIGNING_SECRET_V2`, register `v2`, switch the minter, then drop `v1` once all live tokens have expired."
- **New convention:** "Every external call (Supabase, Upstash, Google Places, JWKS) MUST be wrapped in `withBreadcrumb(area, message, fn, data?)` from `src/middleware/sentry.ts`. This is the only sanctioned way to satisfy the Sentry pattern; a bare addBreadcrumb + try/catch is a review issue."
- **New convention:** "Production code paths MUST NOT import from `src/lib/test-tokens.ts` or `tests/_helpers/*`. Test-only code stays test-only."
- **Phase plan update:** Phase 2 ships verifiers only. The OAuth issuer endpoints + consent screen are extracted into a new Phase 5.5 (between MCP server and ora.run submission) — or folded into Phase 5 — to be decided when Phase 5 starts.
- **Hono export rule clarification:** `export default app` is forbidden only when hand-crafting `{ fetch: app.fetch }`. `Sentry.withSentry(opts, app)` is the canonical wrapper and is allowed.

## 11. Approval gates within Phase 2 implementation

Per CLAUDE.md, the implementation plan must STOP and ask before:

- adding `jose` to `package.json` (already pre-approved during brainstorm — implementation plan will note this)
- adding `paths` to `tsconfig.json` (small but a structural change — pre-approved during brainstorm)
- modifying `src/index.ts` from the Phase 1 minimal shape (necessary for Sentry wrapping)
- updating CLAUDE.md (Section 10 above)
- modifying `lefthook.yml` (none expected, but flag if needed)
- the first commit of Phase 2 (per Phase 1's pattern)

No bindings are added in Phase 2 (no KV / DO / R2 / queues). `wrangler.toml` stays untouched. `bunx wrangler types` is not re-run.

## 12. Phase 3 handoff

At end of Phase 2, Phase 3 inherits:

- `requireScope("X")` for every route that needs scoped access
- `c.var.auth.sub` (typed) inside handlers
- `withBreadcrumb()` for every external call
- A test pattern that mints fake tokens locally and asserts via `app.request()`

Phase 3's first move is wiring the Supabase client (`src/lib/supabase.ts`) and `/v1/health`, then implementing `/v1/me` as the simplest auth-using endpoint. Both should fall out cleanly from the Phase 2 primitives.

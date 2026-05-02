# Phase 2 — Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the verifier-side auth foundation for spontai-api — JWT verification (Bearer + ApiKey), per-route scope enforcement, and a Sentry context middleware that satisfies CLAUDE.md's mandated breadcrumb/captureException pattern.

**Architecture:** Three middleware files (`auth.ts`, `scope.ts`, `sentry.ts`) plus a small constants/types layer. A test-only JWT minter lets us write thorough unit tests without standing up the issuer-side OAuth flow (deferred). Public routes skip auth entirely; protected routes wrap a single `requireScope("X")` middleware that runs verification + scope check in one pass. CLAUDE.md gets four new conventions enforcing the patterns.

**Tech Stack:** Hono 4.12, `jose` (new dep, ^5 or ^6 — let bun resolve), `@sentry/cloudflare`, `@upstash/redis` (factory only — no Phase-2 callers), Bun test runner, Biome 2.4 lint.

**Source spec:** `docs/superpowers/specs/2026-05-02-phase-2-auth-foundation-design.md`

---

## Approval gates

The spec lists these stop-and-ask gates. Mark each as encountered:

- [ ] **Gate 1: First commit of Phase 2** — Show staged diff, get explicit user approval before the FIRST `git commit`. Subsequent TDD commits within Phase 2 flow autonomously (the user has already opted into "autoaccept" for Phase 2).
- [x] `jose` dependency — pre-approved during brainstorm (Section 1 of design)
- [x] `tsconfig.json` `paths` addition — pre-approved during brainstorm
- [x] `src/index.ts` modification (Sentry wrap + sentryContext) — pre-approved by spec acceptance
- [x] CLAUDE.md updates (4 new conventions) — pre-approved by spec Section 10

---

## File map

```
NEW:
  src/lib/scopes.ts                  # SCOPES const, KnownScope type, API_KEY_ALLOWED_SCOPES
  src/lib/upstash.ts                 # @upstash/redis client factory (no Phase 2 callers)
  src/lib/test-tokens.ts             # DEV/TEST ONLY JWT minter — primary source
  src/types/auth.ts                  # AuthContext discriminated union
  src/types/hono.ts                  # AppEnv (Bindings + Variables)
  src/middleware/auth.ts             # verifyAuth(c) — verifies Bearer or ApiKey
  src/middleware/scope.ts            # requireScope(scope) middleware factory
  src/middleware/sentry.ts           # sentryContext() middleware + withBreadcrumb() helper
  tests/_helpers/env.ts              # re-exports test-tokens + testEnv() helper
  tests/middleware/auth.test.ts      # 11 tests
  tests/middleware/scope.test.ts     #  4 tests
  tests/middleware/sentry.test.ts    #  2 tests

MODIFY:
  package.json                       # add jose dep
  bun.lock                           # auto, via bun add
  tsconfig.json                      # add baseUrl + paths
  src/index.ts                       # wrap with Sentry.withSentry, apply sentryContext
  CLAUDE.md                          # add 4 conventions per spec Section 10
```

**Spec deviation:** The design spec described `tests/_helpers/env.ts` as the primary location with `src/lib/test-tokens.ts` re-exporting from it. This plan inverts the dependency direction: `src/lib/test-tokens.ts` is the primary source, and `tests/_helpers/env.ts` re-exports + adds a `testEnv()` convenience. Reason: `src/` should never depend on `tests/`. Functionally equivalent.

---

## Task 1: Add `jose` dependency + tsconfig path alias

**Files:**
- Modify: `package.json` (auto via `bun add`)
- Modify: `bun.lock` (auto)
- Modify: `tsconfig.json:2-21` (add `baseUrl` + `paths`)

- [ ] **Step 1: Install `jose`**

```sh
bun add jose
```

Expected: prints something like `installed jose@5.x.y` (any 5.x or 6.x is fine).

- [ ] **Step 2: Verify wrangler still resolves and version locked**

```sh
bunx wrangler --version
```

Expected: `4.87.0` (unchanged).

- [ ] **Step 3: Update `tsconfig.json` to add `baseUrl` + `paths`**

Read `tsconfig.json` first, then apply this exact edit:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "WebWorker"],
    "types": ["bun-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*", "worker-configuration.d.ts"]
}
```

- [ ] **Step 4: Verify everything still passes**

```sh
bunx tsc --noEmit && bunx biome check . && bun test
```

Expected:
- `tsc` exits 0
- `biome` exits 0 (info-level schema-version diag is fine)
- `bun test` reports `1 pass / 0 fail`

- [ ] **Step 5: Stage everything for Approval Gate 1**

```sh
git add package.json bun.lock tsconfig.json
git status
git diff --staged
```

- [ ] **Step 6: APPROVAL GATE 1 — wait for user approval before committing**

Ask: "Phase 2 first commit ready. Diff above. Approve to commit as `chore: add jose + tsconfig path alias for phase 2 auth`?"

- [ ] **Step 7: Commit (after approval)**

```sh
git commit -m "$(cat <<'EOF'
chore: add jose + tsconfig path alias for phase 2 auth

- jose: JWT verify/sign library (used by auth middleware + test-tokens helper)
- tsconfig: baseUrl + paths to enable @/* aliases (pays off as Phase 3 grows)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Constants + types

**Files:**
- Create: `src/lib/scopes.ts`
- Create: `src/types/auth.ts`
- Create: `src/types/hono.ts`

- [ ] **Step 1: Create `src/lib/scopes.ts`**

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

- [ ] **Step 2: Create `src/types/auth.ts`**

```ts
export type AuthContext =
  | {
      kind: "oauth_access";
      sub: string;
      clientId: string;
      scopes: string[];
      jti: string;
    }
  | {
      kind: "api_key";
      sub: string;
      scopes: string[];
      jti: string;
    };
```

- [ ] **Step 3: Create `src/types/hono.ts`**

```ts
import type { AuthContext } from "@/types/auth";

export type AppEnv = {
  Bindings: {
    HMAC_SIGNING_SECRET: string;
    SENTRY_DSN?: string;
    UPSTASH_REDIS_REST_URL: string;
    UPSTASH_REDIS_REST_TOKEN: string;
  };
  Variables: {
    auth?: AuthContext;
    requiredScope?: string;
  };
};
```

`auth?` is optional — public routes never set it. Handlers behind `requireScope` may use a non-null assertion (`c.var.auth!.sub`) since middleware guarantees it's set.

- [ ] **Step 4: Verify typecheck + lint**

```sh
bunx tsc --noEmit && bunx biome check --write .
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```sh
git add src/lib/scopes.ts src/types/auth.ts src/types/hono.ts
git commit -m "$(cat <<'EOF'
feat(types): add scope vocabulary, AuthContext, and AppEnv types

- src/lib/scopes.ts: 7 per-resource scopes + API_KEY_ALLOWED_SCOPES
  (only feed:read in v1)
- src/types/auth.ts: discriminated union for c.var.auth
- src/types/hono.ts: AppEnv with Bindings + Variables for typed Hono context

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Test helpers (JWT minting)

**Files:**
- Create: `src/lib/test-tokens.ts`
- Create: `tests/_helpers/env.ts`

- [ ] **Step 1: Create `src/lib/test-tokens.ts`**

```ts
// DEV/TEST ONLY — JWT minting helpers used by tests and local dev.
// Production code paths MUST NOT import this. Once Phase 5+ adds
// /oauth/token, real tokens will be minted there instead.

import { SignJWT } from "jose";

export const TEST_HMAC_SECRET = "phase2-test-secret-32-chars-min-length-!!";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

type Kind = "oauth_access" | "api_key";

export interface MintJwtOpts {
  kind: Kind;
  sub: string;
  scopes: string[];
  clientId?: string;
  expiresAtUnix?: number;
  expiresInSec?: number;
  iss?: string;
  aud?: string;
  secret?: string;
  kid?: string;
}

export async function mintTestJwt(opts: MintJwtOpts): Promise<string> {
  const secretStr = opts.secret ?? TEST_HMAC_SECRET;
  const exp =
    opts.expiresAtUnix ??
    Math.floor(Date.now() / 1000) + (opts.expiresInSec ?? 900);

  const claims: Record<string, unknown> = {
    kind: opts.kind,
    scope: opts.scopes.join(" "),
  };
  if (opts.kind === "oauth_access") {
    claims["client_id"] = opts.clientId ?? "test_client_default";
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", kid: opts.kid ?? "v1", typ: "JWT" })
    .setIssuer(opts.iss ?? "spontai-api")
    .setAudience(opts.aud ?? "spontai-api")
    .setSubject(opts.sub)
    .setIssuedAt()
    .setExpirationTime(exp)
    .setJti(crypto.randomUUID())
    .sign(encode(secretStr));
}

export const mintTestAccessToken = (
  opts: Omit<MintJwtOpts, "kind">,
): Promise<string> => mintTestJwt({ ...opts, kind: "oauth_access" });

export const mintTestApiKey = (
  opts: Omit<MintJwtOpts, "kind">,
): Promise<string> =>
  mintTestJwt({
    ...opts,
    kind: "api_key",
    expiresInSec: opts.expiresInSec ?? 365 * 24 * 60 * 60,
  });
```

- [ ] **Step 2: Create `tests/_helpers/env.ts`**

```ts
import type { AppEnv } from "../../src/types/hono";

export {
  TEST_HMAC_SECRET,
  mintTestJwt,
  mintTestAccessToken,
  mintTestApiKey,
} from "../../src/lib/test-tokens";

export function testEnv(
  overrides: Partial<AppEnv["Bindings"]> = {},
): AppEnv["Bindings"] {
  return {
    HMAC_SIGNING_SECRET: "phase2-test-secret-32-chars-min-length-!!",
    UPSTASH_REDIS_REST_URL: "https://test-upstash.invalid",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
    ...overrides,
  };
}
```

- [ ] **Step 3: Verify build**

```sh
bunx tsc --noEmit && bunx biome check --write .
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```sh
git add src/lib/test-tokens.ts tests/_helpers/env.ts
git commit -m "$(cat <<'EOF'
feat(tests): add JWT minting test helpers

- src/lib/test-tokens.ts: dev/test-only JWT minter using jose
- tests/_helpers/env.ts: testEnv() bindings factory + minter re-exports

Production code paths must not import test-tokens.ts (convention).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Sentry middleware (TDD)

**Files:**
- Create: `src/middleware/sentry.ts`
- Create: `tests/middleware/sentry.test.ts`

- [ ] **Step 1: Write failing tests in `tests/middleware/sentry.test.ts`**

```ts
import { describe, expect, it, mock } from "bun:test";

const breadcrumbs: Array<Record<string, unknown>> = [];
const captures: Array<{ error: unknown; tags: Record<string, string> }> = [];

mock.module("@sentry/cloudflare", () => ({
  addBreadcrumb: (b: Record<string, unknown>) => breadcrumbs.push(b),
  captureException: (
    error: unknown,
    opts: { tags: Record<string, string> },
  ) => captures.push({ error, tags: opts.tags }),
  getCurrentScope: () => ({
    setTags: () => undefined,
    setUser: () => undefined,
  }),
  withSentry: <T>(_optsFn: unknown, app: T) => app,
}));

import { withBreadcrumb } from "../../src/middleware/sentry";

describe("withBreadcrumb", () => {
  it("returns the function's result and adds a breadcrumb on success", async () => {
    breadcrumbs.length = 0;
    captures.length = 0;

    const result = await withBreadcrumb(
      "test_area",
      "doing a thing",
      async () => 42,
      { foo: "bar" },
    );

    expect(result).toBe(42);
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]).toMatchObject({
      category: "test_area",
      message: "doing a thing",
      level: "info",
      data: { foo: "bar" },
    });
    expect(captures).toHaveLength(0);
  });

  it("rethrows after captureException with area tag on failure", async () => {
    breadcrumbs.length = 0;
    captures.length = 0;

    const boom = new Error("kaboom");
    let caught: unknown;
    try {
      await withBreadcrumb("upstash_get", "fetching key", async () => {
        throw boom;
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBe(boom);
    expect(captures).toHaveLength(1);
    expect(captures[0]).toEqual({
      error: boom,
      tags: { area: "upstash_get" },
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail with module-not-found**

```sh
bun test tests/middleware/sentry.test.ts
```

Expected: FAIL with `Cannot find module '../../src/middleware/sentry'` (or similar).

- [ ] **Step 3: Implement `src/middleware/sentry.ts`**

```ts
import * as Sentry from "@sentry/cloudflare";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "@/types/hono";

export const sentryContext = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  Sentry.getCurrentScope().setTags({
    "http.method": c.req.method,
    "http.route": c.req.routePath ?? c.req.path,
  });
  await next();
  const auth = c.var.auth;
  if (auth) {
    Sentry.getCurrentScope().setUser({ id: auth.sub });
    Sentry.getCurrentScope().setTags({
      "auth.kind": auth.kind,
      "auth.client_id": auth.kind === "oauth_access" ? auth.clientId : "n/a",
    });
  }
};

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

- [ ] **Step 4: Run tests — verify they pass**

```sh
bun test tests/middleware/sentry.test.ts
```

Expected: `2 pass / 0 fail`.

- [ ] **Step 5: Run typecheck + lint**

```sh
bunx tsc --noEmit && bunx biome check --write .
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```sh
git add src/middleware/sentry.ts tests/middleware/sentry.test.ts
git commit -m "$(cat <<'EOF'
feat(middleware): add Sentry context + withBreadcrumb helper

- sentryContext() Hono middleware: tags http.method/route, sets user from c.var.auth
- withBreadcrumb(area, message, fn, data?): the only sanctioned way to wrap external calls per CLAUDE.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Auth middleware (TDD)

**Files:**
- Create: `src/middleware/auth.ts`
- Create: `tests/middleware/auth.test.ts`

This task writes all 11 auth-verifier tests up front, then implements `verifyAuth` once. The tests cover happy paths + 9 failure modes.

- [ ] **Step 1: Write failing tests in `tests/middleware/auth.test.ts`**

```ts
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import {
  mintTestAccessToken,
  mintTestApiKey,
  mintTestJwt,
  testEnv,
} from "../_helpers/env";
import { verifyAuth } from "../../src/middleware/auth";
import type { AppEnv } from "../../src/types/hono";

function buildProbeApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get("/probe", async (c) => {
    const result = await verifyAuth(c);
    if (result instanceof Response) return result;
    return c.json({ ok: true, auth: result });
  });
  return app;
}

const env = testEnv();

describe("verifyAuth", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const res = await buildProbeApp().request("/probe", {}, env);
    expect(res.status).toBe(401);
  });

  it("returns 401 for Authorization header with no recognized scheme", async () => {
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: "notreal abc.def.ghi" } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for Bearer with non-JWT garbage", async () => {
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: "Bearer notajwt" } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for Bearer JWT signed with wrong secret", async () => {
    const token = await mintTestAccessToken({
      sub: "user_1",
      scopes: ["trips:read"],
      secret: "different-secret-32-chars-long-!!!!!!!!",
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for Bearer JWT with exp in the past", async () => {
    const token = await mintTestAccessToken({
      sub: "user_1",
      scopes: ["trips:read"],
      expiresAtUnix: Math.floor(Date.now() / 1000) - 60,
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for Bearer JWT with wrong iss", async () => {
    const token = await mintTestAccessToken({
      sub: "user_1",
      scopes: ["trips:read"],
      iss: "different-issuer",
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for Bearer JWT with kind=api_key (scheme/kind mismatch)", async () => {
    const token = await mintTestJwt({
      kind: "api_key",
      sub: "partner_acme",
      scopes: ["feed:read"],
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for ApiKey JWT with kind=oauth_access (scheme/kind mismatch)", async () => {
    const token = await mintTestJwt({
      kind: "oauth_access",
      sub: "user_1",
      scopes: ["trips:read"],
      clientId: "agent_foo",
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `ApiKey ${token}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("accepts a valid Bearer oauth_access token and populates auth context", async () => {
    const token = await mintTestAccessToken({
      sub: "user_42",
      clientId: "agent_summarizer",
      scopes: ["trips:read", "places:read"],
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; auth: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.auth.kind).toBe("oauth_access");
    expect(body.auth.sub).toBe("user_42");
    expect(body.auth.clientId).toBe("agent_summarizer");
    expect(body.auth.scopes).toEqual(["trips:read", "places:read"]);
  });

  it("accepts a valid ApiKey with feed:read scope", async () => {
    const token = await mintTestApiKey({
      sub: "partner_acme",
      scopes: ["feed:read"],
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `ApiKey ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; auth: Record<string, unknown> };
    expect(body.auth.kind).toBe("api_key");
    expect(body.auth.sub).toBe("partner_acme");
  });

  it("returns 401 for ApiKey requesting a non-allowlisted scope (trips:read)", async () => {
    const token = await mintTestApiKey({
      sub: "partner_acme",
      scopes: ["trips:read"],
    });
    const res = await buildProbeApp().request(
      "/probe",
      { headers: { authorization: `ApiKey ${token}` } },
      env,
    );
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests — verify all 11 fail**

```sh
bun test tests/middleware/auth.test.ts
```

Expected: 11 failures (likely `Cannot find module '../../src/middleware/auth'`).

- [ ] **Step 3: Implement `src/middleware/auth.ts`**

```ts
import type { Context } from "hono";
import { decodeProtectedHeader, jwtVerify } from "jose";
import { isApiKeyAllowedScope } from "@/lib/scopes";
import type { AuthContext } from "@/types/auth";
import type { AppEnv } from "@/types/hono";

const ISSUER = "spontai-api";
const AUDIENCE = "spontai-api";

function jsonError(
  status: 401 | 403,
  code: string,
  description: string,
): Response {
  return new Response(
    JSON.stringify({ error: code, error_description: description }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function getSigningKey(
  kid: string,
  env: AppEnv["Bindings"],
): Uint8Array | null {
  const map: Record<string, string | undefined> = {
    v1: env.HMAC_SIGNING_SECRET,
  };
  const secret = map[kid];
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export async function verifyAuth(
  c: Context<AppEnv>,
): Promise<AuthContext | Response> {
  const header = c.req.header("authorization");
  if (!header) {
    return jsonError(401, "invalid_request", "Missing Authorization header");
  }

  const parts = header.split(" ");
  if (parts.length !== 2) {
    return jsonError(401, "invalid_request", "Malformed Authorization header");
  }
  const [scheme, token] = parts;
  if (!scheme || !token) {
    return jsonError(401, "invalid_request", "Malformed Authorization header");
  }

  const expectedKind: AuthContext["kind"] | null =
    scheme === "Bearer"
      ? "oauth_access"
      : scheme === "ApiKey"
        ? "api_key"
        : null;
  if (!expectedKind) {
    return jsonError(401, "invalid_request", `Unknown auth scheme: ${scheme}`);
  }

  let kid: string | undefined;
  try {
    const protectedHeader = decodeProtectedHeader(token);
    kid = protectedHeader.kid;
  } catch {
    return jsonError(401, "invalid_token", "Token header could not be decoded");
  }
  if (!kid) {
    return jsonError(401, "invalid_token", "Token missing kid header");
  }

  const key = getSigningKey(kid, c.env);
  if (!key) {
    return jsonError(401, "invalid_token", `Unknown kid: ${kid}`);
  }

  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, key, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    return jsonError(401, "invalid_token", "Token signature invalid or expired");
  }

  const kind = payload["kind"];
  if (kind !== expectedKind) {
    return jsonError(401, "invalid_token", "Token kind does not match auth scheme");
  }

  const sub = typeof payload["sub"] === "string" ? payload["sub"] : null;
  if (!sub) {
    return jsonError(401, "invalid_token", "Token missing sub claim");
  }

  const jti = typeof payload["jti"] === "string" ? payload["jti"] : "";
  const scopeStr = typeof payload["scope"] === "string" ? payload["scope"] : "";
  const scopes = scopeStr.length > 0 ? scopeStr.split(" ") : [];

  if (kind === "api_key") {
    for (const s of scopes) {
      if (!isApiKeyAllowedScope(s)) {
        return jsonError(401, "invalid_scope", `API key may not request scope: ${s}`);
      }
    }
    return { kind: "api_key", sub, scopes, jti };
  }

  const clientId = typeof payload["client_id"] === "string" ? payload["client_id"] : "";
  if (!clientId) {
    return jsonError(401, "invalid_token", "OAuth token missing client_id");
  }
  return { kind: "oauth_access", sub, scopes, jti, clientId };
}
```

- [ ] **Step 4: Run tests — verify all 11 pass**

```sh
bun test tests/middleware/auth.test.ts
```

Expected: `11 pass / 0 fail`.

- [ ] **Step 5: Run typecheck + lint**

```sh
bunx tsc --noEmit && bunx biome check --write .
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```sh
git add src/middleware/auth.ts tests/middleware/auth.test.ts
git commit -m "$(cat <<'EOF'
feat(middleware): add JWT verifier for Bearer + ApiKey schemes

verifyAuth(c) returns AuthContext on success or RFC-6750 JSON error response.

- Defense-in-depth: scheme/kind cross-check rejects token-confusion attacks
- ApiKey scopes validated against API_KEY_ALLOWED_SCOPES allowlist at verify
- kid header drives signing-key lookup (rotation-ready map; v1 only today)
- iss/aud locked to "spontai-api"; HS256 only

11 tests covering: missing/malformed headers, garbage tokens, wrong secret,
expired, wrong iss, scheme/kind mismatches both ways, valid Bearer, valid
ApiKey, ApiKey requesting forbidden scope.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Scope middleware (TDD)

**Files:**
- Create: `src/middleware/scope.ts`
- Create: `tests/middleware/scope.test.ts`

- [ ] **Step 1: Write failing tests in `tests/middleware/scope.test.ts`**

```ts
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { mintTestAccessToken, mintTestApiKey, testEnv } from "../_helpers/env";
import { requireScope } from "../../src/middleware/scope";
import type { AppEnv } from "../../src/types/hono";

function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get("/public", (c) => c.json({ ok: true }));
  app.get("/trips", requireScope("trips:read"), (c) =>
    c.json({ ok: true, sub: c.var.auth!.sub }),
  );
  app.get("/feed", requireScope("feed:read"), (c) =>
    c.json({ ok: true, sub: c.var.auth!.sub }),
  );
  return app;
}

const env = testEnv();

describe("requireScope", () => {
  it("returns 403 when token is valid but missing required scope", async () => {
    const token = await mintTestAccessToken({
      sub: "user_1",
      scopes: ["places:read"],
    });
    const res = await buildApp().request(
      "/trips",
      { headers: { authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("insufficient_scope");
  });

  it("returns 200 when token has the exact required scope", async () => {
    const token = await mintTestAccessToken({
      sub: "user_1",
      scopes: ["trips:read"],
    });
    const res = await buildApp().request(
      "/trips",
      { headers: { authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["sub"]).toBe("user_1");
  });

  it("returns 200 when token has the required scope among multiple scopes", async () => {
    const token = await mintTestApiKey({
      sub: "partner_acme",
      scopes: ["feed:read"],
    });
    const res = await buildApp().request(
      "/feed",
      { headers: { authorization: `ApiKey ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
  });

  it("returns 200 on a public route without any Authorization header", async () => {
    const res = await buildApp().request("/public", {}, env);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests — verify all 4 fail**

```sh
bun test tests/middleware/scope.test.ts
```

Expected: 4 failures (module not found).

- [ ] **Step 3: Implement `src/middleware/scope.ts`**

```ts
import type { MiddlewareHandler } from "hono";
import type { KnownScope } from "@/lib/scopes";
import { verifyAuth } from "@/middleware/auth";
import type { AppEnv } from "@/types/hono";

export function requireScope(
  scope: KnownScope,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set("requiredScope", scope);

    const result = await verifyAuth(c);
    if (result instanceof Response) {
      return result;
    }
    c.set("auth", result);

    if (!result.scopes.includes(scope)) {
      return new Response(
        JSON.stringify({
          error: "insufficient_scope",
          error_description: `Required scope: ${scope}`,
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }

    await next();
  };
}
```

- [ ] **Step 4: Run tests — verify all 4 pass**

```sh
bun test tests/middleware/scope.test.ts
```

Expected: `4 pass / 0 fail`.

- [ ] **Step 5: Run typecheck + lint**

```sh
bunx tsc --noEmit && bunx biome check --write .
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```sh
git add src/middleware/scope.ts tests/middleware/scope.test.ts
git commit -m "$(cat <<'EOF'
feat(middleware): add requireScope for per-route scope enforcement

requireScope(scope) is a Hono middleware that:
1. Calls verifyAuth(c) — 401 on failure
2. Stashes c.set('auth', ...) and c.set('requiredScope', ...) for handlers + Phase 4 OpenAPI gen
3. Checks scope membership — 403 with error=insufficient_scope on failure

4 tests: missing scope, valid scope, valid scope among many, public route.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Upstash client factory

**Files:**
- Create: `src/lib/upstash.ts`

No tests — there are no Phase 2 callers. The factory exists for Phase 3+ and only needs to typecheck.

- [ ] **Step 1: Create `src/lib/upstash.ts`**

```ts
import { Redis } from "@upstash/redis";
import type { AppEnv } from "@/types/hono";

export function createUpstashClient(env: AppEnv["Bindings"]): Redis {
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}
```

- [ ] **Step 2: Verify build**

```sh
bunx tsc --noEmit && bunx biome check --write .
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```sh
git add src/lib/upstash.ts
git commit -m "$(cat <<'EOF'
feat(lib): add Upstash Redis client factory

Factory only — no Phase 2 callers. Phase 3+ will use it for refresh-token
storage and rate-limit context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wire `src/index.ts` (Sentry wrap + sentryContext)

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Read current `src/index.ts`** (required before Edit)

```sh
cat src/index.ts
```

Expected current content:
```ts
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) =>
  c.json({
    ok: true,
    name: "spontai-api",
    version: "0.0.1",
  }),
);

export default app;
```

- [ ] **Step 2: Replace `src/index.ts` with the wired version**

```ts
import * as Sentry from "@sentry/cloudflare";
import { Hono } from "hono";
import { sentryContext } from "@/middleware/sentry";
import type { AppEnv } from "@/types/hono";

const app = new Hono<AppEnv>();
app.use("*", sentryContext());

app.get("/", (c) =>
  c.json({
    ok: true,
    name: "spontai-api",
    version: "0.0.1",
  }),
);

export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  }),
  app,
);
```

- [ ] **Step 3: Run smoke test — must still pass**

```sh
bun test tests/smoke.test.ts
```

Expected: `1 pass / 0 fail`.

If smoke.test.ts breaks because the Sentry-wrapped default export is no longer a Hono app: update `tests/smoke.test.ts` to import the Hono app under a named export. Add `export { app };` to `src/index.ts` and change smoke.test.ts to `import { app } from "../src/index";`.

- [ ] **Step 4: Run full test suite**

```sh
bun test
```

Expected: 18 pass / 0 fail (1 smoke + 2 sentry + 11 auth + 4 scope).

- [ ] **Step 5: Run typecheck + lint**

```sh
bunx tsc --noEmit && bunx biome check --write .
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```sh
git add src/index.ts tests/smoke.test.ts
git commit -m "$(cat <<'EOF'
feat(app): wrap Hono with Sentry.withSentry, apply sentryContext globally

- src/index.ts: typed AppEnv Hono, sentryContext middleware, Sentry.withSentry wrapper
- Sentry no-ops cleanly when SENTRY_DSN is empty (local dev unchanged)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: CLAUDE.md updates

**Files:**
- Modify: `CLAUDE.md`

Add 4 new conventions per spec Section 10. Use Edit operations.

- [ ] **Step 1: Read current CLAUDE.md** (Edit prerequisite)

```sh
head -60 CLAUDE.md
```

- [ ] **Step 2: Add new conventions to the "Code conventions" section**

Find the `### Hono-specific` heading. After its existing bullets, insert a new heading and conventions before the `## Out of scope for v1` section:

```markdown
### Auth (Phase 2 onwards)

- JWT signing keys carry `kid: "v1"` headers. `src/middleware/auth.ts` reads the secret via a `kid`-keyed map. To rotate: provision `HMAC_SIGNING_SECRET_V2`, register `v2`, switch the minter to sign with `v2`, then drop `v1` once all live tokens have expired (≤15 min for OAuth access; up to 365 days for partner API keys).
- Two auth schemes are accepted: `Authorization: Bearer <jwt>` (OAuth access tokens, `kind: "oauth_access"`) and `Authorization: ApiKey <jwt>` (partner keys, `kind: "api_key"`). The wire scheme and the `kind` claim are cross-checked.
- Partner API keys are restricted to scopes in `API_KEY_ALLOWED_SCOPES` (currently only `feed:read`). User-owned scopes (`trips:read`, etc.) are issuable only via OAuth.
- Per-route enforcement uses `requireScope("X")` from `src/middleware/scope.ts`. Public routes apply no middleware; auth-required routes use `requireScope` (which runs verification + scope check in one pass).

### Sentry (mandatory pattern)

- Every external call (Supabase, Upstash, Google Places, JWKS, ...) MUST be wrapped in `withBreadcrumb(area, message, fn, data?)` from `src/middleware/sentry.ts`. This is the only sanctioned way to satisfy the Sentry pattern; a bare `addBreadcrumb` + try/catch is a code-review issue.
- `area` is a stable identifier for the subsystem (e.g., `"supabase_trips"`, `"upstash_token_lookup"`). It becomes the Sentry tag on captured exceptions.

### Test-only code

- Production code paths MUST NOT import from `src/lib/test-tokens.ts` or `tests/_helpers/*`. Test-only code stays test-only. The mint helpers are dev/test fixtures; real OAuth tokens come from `/oauth/token` (Phase 5+).

### Hono export rule (clarification)

- `export default Sentry.withSentry(...)` is the canonical wrapper and is allowed. The "do not hand-craft `{ fetch: app.fetch }`" rule applies only to manual ExportedHandler construction, not to library wrappers that return a properly-shaped handler.
```

- [ ] **Step 3: Update the locked-deps section** (find the line `- Lint/format: Biome 2.4 ...`)

Add a bullet under "Stack (locked May 2026)":

```markdown
- JWT verification: `jose` (^5 or ^6 — let bun resolve)
```

- [ ] **Step 4: Update phase plan** (find the `## Phase plan` section)

Replace the "Phase 2" line with:

```markdown
2. ✅ Auth foundation (verifiers + middleware + Sentry context only — issuer endpoints deferred)
```

And renumber the OAuth-issuer + consent UI work into a new phase. Find the existing list and insert between current Phase 4 (OpenAPI/docs) and Phase 5 (MCP), or fold into Phase 5 — leave a TODO comment marking the decision deferred:

```markdown
<!-- TODO: decide when Phase 5 starts whether OAuth issuer + consent UI is its own phase or folded in. -->
```

- [ ] **Step 5: Verify markdown still renders cleanly**

```sh
bunx biome check --write .
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```sh
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude): add Phase 2 auth + Sentry conventions

- Auth: kid-keyed signing map, Bearer/ApiKey scheme cross-check, ApiKey scope allowlist, requireScope per-route enforcement
- Sentry: withBreadcrumb is the mandatory wrapper for external calls
- Test-only code: src/lib/test-tokens.ts and tests/_helpers/* are non-prod
- Hono export rule clarified: Sentry.withSentry wrapper is allowed

Lockfile: jose added to stack list.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Final verification

No new files; this is the phase exit gate.

- [ ] **Step 1: Run full check sweep**

```sh
bunx biome check . && bunx tsc --noEmit && bun test
```

Expected:
- biome: exit 0 (info-level schema diag is fine)
- tsc: exit 0
- bun test: **18 pass / 0 fail** (1 smoke + 2 sentry + 11 auth + 4 scope)

If anything fails, STOP, debug, do not commit.

- [ ] **Step 2: Run a `wrangler deploy --dry-run` to verify the wrapped app builds**

```sh
bunx wrangler deploy --dry-run --outdir=./dist
```

Expected: build succeeds; `./dist/` contains the bundled output. No errors.

- [ ] **Step 3: Verify clean git tree**

```sh
git status
git log --oneline | head -15
```

Expected: working tree clean. ~9 commits since the Phase 1 root commit.

- [ ] **Step 4: Report Phase 2 completion**

Output to user:

> **Phase 2 complete — 18 tests passing, 0 failing.**
>
> Files added: 11. Files modified: 5. Commits: 9.
>
> Deferred TODOs (Phase 3+):
> - `src/lib/upstash.ts` factory has no callers yet (Phase 3+ will use it)
> - No `/oauth/*` endpoints yet (Phase 5+ adds the issuer)
> - No real route handlers — Phase 3 is next
> - `wrangler.toml` bindings still empty (no KV/DO/secrets bound — `wrangler secret put` for `HMAC_SIGNING_SECRET` deferred until first staging deploy)
>
> Next-session prompt for Phase 3 will go here when ready.

---

## Self-review (executed during plan authoring)

Spec coverage check (Section → Task):

| Spec Section | Implemented in |
|---|---|
| §3 Decisions | Reflected throughout |
| §4.1 Per-request flow | Tasks 5, 6 |
| §4.2 File inventory | Tasks 2, 3, 4, 5, 6, 7, 8 |
| §4.3 New `jose` dep | Task 1 |
| §5.1 OAuth access token format | Tasks 3 (mint), 5 (verify) |
| §5.2 Partner API key format | Tasks 3 (mint), 5 (verify) |
| §5.3 Verification flow | Task 5 |
| §5.4 AuthContext type | Task 2 |
| §5.5 Key rotation map | Task 5 (auth.ts implementation) |
| §5.6 Error responses | Task 5 (jsonError helper), Task 6 |
| §6.1 Scope constants | Task 2 |
| §6.2 Per-route declaration | Task 6 (requireScope) |
| §6.3 Phase-4 forward-compat (`requiredScope` Variable) | Task 6 (`c.set("requiredScope", scope)`) |
| §7.1 Hono types | Task 2 |
| §7.2 src/index.ts shape | Task 8 |
| §7.3 Path aliasing | Task 1 |
| §8.1 sentryContext | Task 4 |
| §8.2 withBreadcrumb | Task 4 |
| §8.3 No-DSN local dev | Inherent — `@sentry/cloudflare`'s default behavior |
| §9.1 Test helpers | Task 3 |
| §9.2 Test files & scenarios | Tasks 4, 5, 6 |
| §9.3 Phase exit gate | Task 10 |
| §10 CLAUDE.md changes | Task 9 |
| §11 Approval gates | "Approval gates" section + Task 1 Step 6 |
| §12 Phase 3 handoff | Task 10 Step 4 |

No gaps detected.

Placeholder scan: clean — no TBDs, TODOs, "implement later", "appropriate error handling" phrases. Every code step has a concrete code block; every command step has the exact command + expected output.

Type consistency: `AuthContext` shape (Task 2) matches what `verifyAuth` returns (Task 5) matches what `requireScope` reads (Task 6). `AppEnv` Bindings/Variables match `testEnv()` shape. Function names consistent: `verifyAuth`, `requireScope`, `sentryContext`, `withBreadcrumb`, `mintTestJwt`, `mintTestAccessToken`, `mintTestApiKey`, `testEnv`, `createUpstashClient`, `isApiKeyAllowedScope`.

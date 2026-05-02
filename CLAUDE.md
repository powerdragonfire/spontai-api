# CLAUDE.md — spontai-api

Durable context for any Claude Code session in this repo. Read this before doing anything.

## What this is

Spontai's public API + MCP server. B2A (business-to-agent) traveler memory layer. The data exposed: visited countries, visited places, trip journals, taste signatures, and similar-destinations recommendations. Free during launch. Goal: A on ora.run agent readiness ranking and listing in the official MCP registry.

The Spontai iOS app lives in a SEPARATE repo and is out of scope for this codebase.

## Stack (locked May 2026)

- Runtime: Cloudflare Workers, `compatibility_date = "2026-05-01"`, `compatibility_flags = ["nodejs_compat"]`
- Framework: Hono v4.12.x — do NOT migrate to v5 (not yet released)
- Language: TypeScript strict
- Package manager / dev runtime / test runner: Bun 1.3.12+
- Deploy: Wrangler 4.87.0+ (requires Node 22+)
- Schema-first: `@hono/zod-openapi` v1.3+ — use `app.doc31()` for OpenAPI 3.1 (NOT `app.doc()`, which emits 3.0)
- Docs UI: `@scalar/hono-api-reference` mounted at `/docs`
- MCP: `@modelcontextprotocol/sdk` ^1.26 (CVE in <1.26) + `agents/mcp` `createMcpHandler`
- Lint/format: Biome 2.4 (single tool — not eslint+prettier)
- Git hooks: Lefthook
- Auth: OAuth 2.1 + PKCE for end-user delegation; HS256-signed API keys for partners
- Observability: Sentry (`@sentry/cloudflare`) + Cloudflare Workers Analytics
- Backing data: existing Supabase Postgres in the iOS app's project (this repo is a read-only consumer, never writes)
- Rate limiting: Cloudflare Rate Limiting + Upstash Redis

## Code conventions — FOLLOW STRICTLY

### Sentry pattern (every session)

- ALWAYS add `Sentry.addBreadcrumb({ message, level, data })` before every external call (Supabase, Upstash, Google Places, etc.)
- ALWAYS wrap external calls in try/catch with `Sentry.captureException(error, { tags: { area: "..." } })` — `area` is a string identifying the subsystem (e.g., `"auth_oauth"`, `"mcp_tool_taste_signature"`, `"google_places_enrich"`)
- Never bare-throw or bare-catch in route handlers

### Manual approval gates — STOP and ask before:

- Editing `wrangler.toml` to add bindings (KV, R2, Durable Objects, queues, secrets)
- Editing `src/middleware/auth.ts` or anything touching JWT/OAuth/HMAC verification
- Adding any DB migration or Supabase schema change (this repo doesn't write to Supabase, so this should be very rare)
- Running `wrangler deploy` to staging or production (`--dry-run` is fine)
- Rotating any secret
- Touching `.dev.vars` (never commit; example lives in `.dev.vars.example`)
- Adding any dependency NOT already locked

### Test gating

- Phases are gated on test counts. After every phase: report `Phase N complete — X tests passing, 0 failing`
- Do not proceed to next phase until I explicitly approve
- Never reduce test count without explicit reason
- Use `bun test`, not vitest or jest

### File structure

- `src/routes/*` — route handlers, one file per resource (`me.ts`, `places.ts`, `trips.ts`, etc.)
- `src/middleware/*` — auth, rate-limiting, Sentry context
- `src/mcp/*` — MCP server setup + tool definitions (one file per tool group)
- `src/schemas/*` — Zod schemas (single source of truth → OpenAPI + types)
- `src/types/*` — non-Zod TypeScript types
- `src/lib/*` — utility functions, client factories (`supabase.ts`, `upstash.ts`)
- `tests/*` — Bun test files mirroring `src/` structure

### TypeScript

- Strict mode always
- `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` enabled
- Never `any`. Use `unknown` and narrow.
- Re-run `bunx wrangler types` after any `wrangler.toml` change

### MCP-specific gotchas

- `McpServer` instances MUST be created per-request, never module-scope (CVE in <1.26 leaks responses across clients otherwise)
- Use `createMcpHandler` from `agents/mcp`, NOT raw `StreamableHTTPServerTransport` — handles the per-request requirement automatically
- Tool descriptions are READ BY AGENTS — write them as decision-grounded function docstrings (when to call, what it returns), not dev docs

### Hono-specific

- `export default app` (NOT `export default { fetch: app.fetch }` — causes cryptic Vite/Hono errors)
- Use `c.var.X` for typed context, never `c.set(...)` unless explicitly setting

## Out of scope for v1

- Write endpoints (POST/PUT/DELETE) — read-only API for entire launch
- Webhooks, SSE/streaming
- Federated identity ("Login with Spontai")
- Anything that lives in the iOS app's separate repo

## Phase plan

1. ✅ Scaffold (this phase — empty repo to first commit)
2. Auth foundation: OAuth 2.1 + API key middleware, scope enforcement, Upstash token store
3. Resource endpoints: `/v1/health`, `/v1/me`, taste-signature, visited-countries, visited-places, trips, places, public feed, recommendations
4. OpenAPI 3.1 spec + Scalar docs at `/docs`, semantic metadata on every operation
5. MCP server with 9 tools (per the implementation plan doc)
6. Well-known files served at `spontai.com` root: `llms.txt`, `robots.txt`, `sitemap.xml`, `.well-known/mcp.json`, `.well-known/mcp/server-card.json`, `.well-known/agent-skills/index.json` (NOTE: these go on the marketing site, not this API repo)
7. SDK generation (Speakeasy) + ora.run submission + MCP registry submission

Each phase is its own Claude Code session.

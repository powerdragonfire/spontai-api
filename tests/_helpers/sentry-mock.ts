// Global test stub for @sentry/cloudflare, installed via bunfig.toml [test].preload so
// it is active BEFORE any test file imports src/index.
//
// Why a preload: the real Sentry.withSentry() mutates the Hono handler in place
// (instrumentExportedHandlerFetch wraps app.fetch). If src/index is ever evaluated
// with the real module — even once, in any test file — the shared `app` becomes
// permanently instrumented and later handler requests crash on the real SDK init path.
// Installing a passthrough stub first keeps `app` un-instrumented and the suite
// deterministic regardless of file execution order.
//
// The spy arrays below are imported by tests/middleware/sentry.test.ts to assert on
// withBreadcrumb's behaviour.

import { mock } from "bun:test";

export const breadcrumbs: Array<Record<string, unknown>> = [];
export const captures: Array<{ error: unknown; tags: Record<string, string> }> = [];

// Chainable scope stub: every property is a function returning the stub, so any scope
// method the code touches (setTags/setUser/update/…) is a safe no-op.
const scopeStub: unknown = new Proxy({}, { get: () => () => scopeStub });

mock.module("@sentry/cloudflare", () => ({
  addBreadcrumb: (b: Record<string, unknown>) => breadcrumbs.push(b),
  captureException: (error: unknown, opts: { tags: Record<string, string> }) =>
    captures.push({ error, tags: opts.tags }),
  getCurrentScope: () => scopeStub,
  withSentry: <T>(_optsFn: unknown, app: T) => app,
}));

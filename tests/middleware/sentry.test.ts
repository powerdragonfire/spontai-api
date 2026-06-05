import { describe, expect, it, mock } from "bun:test";

const breadcrumbs: Array<Record<string, unknown>> = [];
const captures: Array<{ error: unknown; tags: Record<string, string> }> = [];

mock.module("@sentry/cloudflare", () => ({
  addBreadcrumb: (b: Record<string, unknown>) => breadcrumbs.push(b),
  captureException: (error: unknown, opts: { tags: Record<string, string> }) =>
    captures.push({ error, tags: opts.tags }),
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

    const result = await withBreadcrumb("test_area", "doing a thing", async () => 42, {
      foo: "bar",
    });

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

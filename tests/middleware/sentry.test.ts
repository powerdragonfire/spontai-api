import { describe, expect, it } from "bun:test";
import { withBreadcrumb } from "../../src/middleware/sentry";
// The @sentry/cloudflare stub + these spy arrays are installed globally via the
// bunfig.toml [test].preload (tests/_helpers/sentry-mock.ts) so the real withSentry
// never instruments the shared app. We just assert against the recorded calls here.
import { breadcrumbs, captures } from "../_helpers/sentry-mock";

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

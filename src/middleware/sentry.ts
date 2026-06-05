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
  Sentry.addBreadcrumb({
    category: area,
    message,
    level: "info",
    ...(data ? { data } : {}),
  });
  try {
    return await fn();
  } catch (error) {
    Sentry.captureException(error, { tags: { area } });
    throw error;
  }
}

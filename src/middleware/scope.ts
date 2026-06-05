import type { MiddlewareHandler } from "hono";
import type { KnownScope } from "@/lib/scopes";
import { verifyAuth } from "@/middleware/auth";
import type { AppEnv } from "@/types/hono";

export function requireScope(scope: KnownScope): MiddlewareHandler<AppEnv> {
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

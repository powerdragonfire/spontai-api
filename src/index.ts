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

export { app };

export default Sentry.withSentry(
  (env: AppEnv["Bindings"]) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  }),
  app,
);

import * as Sentry from "@sentry/cloudflare";
import { Hono } from "hono";
import { sentryContext } from "@/middleware/sentry";
import { health } from "@/routes/health";
import { hiddenGems } from "@/routes/hidden-gems";
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

app.route("/v1/health", health);
app.route("/v1/hidden-gems", hiddenGems);

export { app };

export default Sentry.withSentry(
  (env: AppEnv["Bindings"]) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  }),
  app,
);

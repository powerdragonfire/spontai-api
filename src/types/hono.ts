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

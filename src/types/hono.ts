import type { AuthContext } from "@/types/auth";

export type AppEnv = {
  Bindings: {
    // Auth
    HMAC_SIGNING_SECRET: string;
    SENTRY_DSN?: string;

    // Redis (Upstash)
    UPSTASH_REDIS_REST_URL: string;
    UPSTASH_REDIS_REST_TOKEN: string;

    // AWS / DynamoDB
    AWS_ACCESS_KEY_ID: string;
    AWS_SECRET_ACCESS_KEY: string;
    AWS_REGION: string;
    HIDDEN_GEMS_TABLE: string;

    /**
     * unset/memory = hermetic in-memory repository
     * dynamo       = DynamoDB repository
     */
    HIDDEN_GEMS_STORE?: "memory" | "dynamo";
  };
  Variables: {
    auth?: AuthContext;
    requiredScope?: string;
  };
};

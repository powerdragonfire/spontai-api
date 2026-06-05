import { Redis } from "@upstash/redis";
import type { AppEnv } from "@/types/hono";

export function createUpstashClient(env: AppEnv["Bindings"]): Redis {
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

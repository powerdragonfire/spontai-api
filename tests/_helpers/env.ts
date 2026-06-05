import type { AppEnv } from "../../src/types/hono";

export {
  mintTestAccessToken,
  mintTestApiKey,
  mintTestJwt,
  TEST_HMAC_SECRET,
} from "../../src/lib/test-tokens";

export function testEnv(overrides: Partial<AppEnv["Bindings"]> = {}): AppEnv["Bindings"] {
  return {
    HMAC_SIGNING_SECRET: "phase2-test-secret-32-chars-min-length-!!",
    UPSTASH_REDIS_REST_URL: "https://test-upstash.invalid",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
    ...overrides,
  };
}

// /v1/health — unauthenticated liveness probe.
//
// Deliberately does NO external work (no Dynamo/Upstash/Supabase ping): an uptime
// monitor or ora.run readiness check needs to know the Worker itself is serving,
// not whether every downstream is reachable. A downstream-aware readiness check,
// if ever needed, belongs on a separate path so a Dynamo blip can't fail liveness.

import { Hono } from "hono";
import type { AppEnv } from "@/types/hono";

export const health = new Hono<AppEnv>();

health.get("/", (c) => c.json({ status: "ok" }));

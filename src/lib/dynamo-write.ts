// src/lib/dynamo-write.ts
// Pure data-transformation utilities shared between seed-dynamo.ts and
// ingest-last30days.ts. No I/O, no AWS client — callers own the network layer.

import { scoreHiddenGem } from "@/lib/hidden-gems/scoring";
import type { HiddenGemRecord } from "@/types/hidden-gems";

export type DynamoAttribute =
  | { S: string }
  | { N: string }
  | { BOOL: boolean }
  | { NULL: true }
  | { M: Record<string, DynamoAttribute> }
  | { L: DynamoAttribute[] };

export function toAttr(value: unknown): DynamoAttribute {
  if (value === null || value === undefined) return { NULL: true };
  if (typeof value === "string") return { S: value };
  if (typeof value === "number") return { N: String(value) };
  if (typeof value === "boolean") return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(toAttr) };
  if (typeof value === "object") {
    return {
      M: Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toAttr(v)]),
      ),
    };
  }
  return { S: String(value) };
}

export function zeroPadScore(score: number): string {
  return Math.round(score).toString().padStart(6, "0");
}

export function normaliseCity(city: string): string {
  return city.trim().toLowerCase();
}

export function toDynamoItem(record: HiddenGemRecord): Record<string, DynamoAttribute> {
  const placeId = record.place.id;
  if (!placeId) throw new Error(`Record missing place.id: ${JSON.stringify(record)}`);

  const city = normaliseCity(record.place.city);
  const { hiddenGemScore } = scoreHiddenGem(record);

  return {
    PK: { S: `PLACE#${placeId}` },
    SK: { S: "RECORD" },
    GSI1PK: { S: `CITY#${city}` },
    GSI1SK: { S: `SCORE#${zeroPadScore(hiddenGemScore)}#PLACE#${placeId}` },
    placeId: { S: placeId },
    city: { S: city },
    hiddenGemScore: { N: String(hiddenGemScore) },
    record: toAttr(record),
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

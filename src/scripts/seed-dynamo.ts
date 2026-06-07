// scripts/seed-dynamo.ts

import { AwsClient } from "aws4fetch";

// Adjust this import to wherever your seed data lives.
import { LONDON_RECORDS } from "@/lib/hidden-gems/seed/london";
import type { HiddenGemRecord } from "@/types/hidden-gems";

const AWS_REGION = process.env.AWS_REGION ?? "eu-west-2";
const HIDDEN_GEMS_TABLE = process.env.HIDDEN_GEMS_TABLE ?? "spontai-hidden-gems";

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  throw new Error(
    "Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY. Use the seeder IAM key locally.",
  );
}

type DynamoAttribute =
  | { S: string }
  | { N: string }
  | { BOOL: boolean }
  | { NULL: true }
  | { M: Record<string, DynamoAttribute> }
  | { L: DynamoAttribute[] };

function toAttr(value: unknown): DynamoAttribute {
  if (value === null || value === undefined) return { NULL: true };

  if (typeof value === "string") return { S: value };
  if (typeof value === "number") return { N: String(value) };
  if (typeof value === "boolean") return { BOOL: value };

  if (Array.isArray(value)) {
    return { L: value.map(toAttr) };
  }

  if (typeof value === "object") {
    return {
      M: Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, toAttr(val)]),
      ),
    };
  }

  return { S: String(value) };
}

function zeroPadScore(score: number): string {
  return Math.round(score).toString().padStart(6, "0");
}

function normaliseCity(city: string): string {
  return city.trim().toLowerCase();
}

function toDynamoItem(record: HiddenGemRecord): Record<string, DynamoAttribute> {
  const placeId = record.place.id;
  const city = normaliseCity(record.place.city);

  // Default score for GSI sorting (seed data doesn't have computed scores)
  const hiddenGemScore = 0;

  if (!placeId) {
    throw new Error(`Seed record missing placeId: ${JSON.stringify(record)}`);
  }

  return {
    PK: { S: `PLACE#${placeId}` },
    SK: { S: "RECORD" },

    GSI1PK: { S: `CITY#${city}` },
    GSI1SK: { S: `SCORE#${zeroPadScore(hiddenGemScore)}#PLACE#${placeId}` },

    placeId: { S: placeId },
    city: { S: city },
    hiddenGemScore: { N: String(hiddenGemScore) },

    // Store the full record (preferred shape per repository comment)
    record: toAttr(record),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

const client = new AwsClient({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
  service: "dynamodb",
});

async function batchWrite(items: Record<string, DynamoAttribute>[]) {
  const response = await client.fetch(`https://dynamodb.${AWS_REGION}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "content-type": "application/x-amz-json-1.0",
      "x-amz-target": "DynamoDB_20120810.BatchWriteItem",
    },
    body: JSON.stringify({
      RequestItems: {
        [HIDDEN_GEMS_TABLE]: items.map((Item) => ({
          PutRequest: { Item },
        })),
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BatchWriteItem failed: ${response.status} ${text}`);
  }

  const result = (await response.json()) as Record<string, unknown>;

  const unprocessedItems = result.UnprocessedItems as Record<string, unknown> | undefined;
  if (unprocessedItems && Object.keys(unprocessedItems).length > 0) {
    throw new Error(`DynamoDB returned UnprocessedItems: ${JSON.stringify(unprocessedItems)}`);
  }
}

async function main() {
  const items = LONDON_RECORDS.map(toDynamoItem);

  for (const batch of chunk(items, 25)) {
    await batchWrite(batch);
    console.log(`Wrote ${batch.length} records`);
  }

  console.log(`Done. Seeded ${items.length} records into ${HIDDEN_GEMS_TABLE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

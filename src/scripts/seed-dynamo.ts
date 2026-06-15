// src/scripts/seed-dynamo.ts
// Seeds the spontai-hidden-gems DynamoDB table with London seed data.
// Run: AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... bun run src/scripts/seed-dynamo.ts
// NEVER deploy the seeder key. This script is local-only.

import { AwsClient } from "aws4fetch";
import { chunk, type DynamoAttribute, toDynamoItem } from "@/lib/dynamo-write";
import { LONDON_RECORDS } from "@/lib/hidden-gems/seed/london";

const AWS_REGION = process.env.AWS_REGION ?? "eu-west-2";
const HIDDEN_GEMS_TABLE = process.env.HIDDEN_GEMS_TABLE ?? "spontai-hidden-gems";
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  throw new Error(
    "Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY. Use the seeder IAM key locally.",
  );
}

const client = new AwsClient({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
  service: "dynamodb",
});

async function batchWrite(items: Record<string, DynamoAttribute>[]): Promise<void> {
  const response = await client.fetch(`https://dynamodb.${AWS_REGION}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "content-type": "application/x-amz-json-1.0",
      "x-amz-target": "DynamoDB_20120810.BatchWriteItem",
    },
    body: JSON.stringify({
      RequestItems: {
        [HIDDEN_GEMS_TABLE]: items.map((Item) => ({ PutRequest: { Item } })),
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BatchWriteItem failed: ${response.status} ${text}`);
  }

  const result = (await response.json()) as Record<string, unknown>;
  const unprocessedItems = result["UnprocessedItems"] as Record<string, unknown> | undefined;
  if (unprocessedItems && Object.keys(unprocessedItems).length > 0) {
    throw new Error(`DynamoDB returned UnprocessedItems: ${JSON.stringify(unprocessedItems)}`);
  }
}

async function main(): Promise<void> {
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

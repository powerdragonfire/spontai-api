// src/scripts/ingest-last30days.ts
// Ingestion pipeline: reads a last30days brief, extracts place candidates,
// builds HiddenGemRecords, and writes them to DynamoDB.
//
// Usage:
//   bun run src/scripts/ingest-last30days.ts \
//     --file ~/Documents/Last30Days/hidden-gems-london.md \
//     --city london \
//     [--run-id <id>] \
//     [--dry-run]
//
// Requires the seeder IAM key (write-capable). NEVER deploy this script.

import { readFileSync } from "node:fs";
import { AwsClient } from "aws4fetch";
import { chunk, type DynamoAttribute, toDynamoItem } from "@/lib/dynamo-write";
import { extractCandidatesFromBrief } from "@/lib/hidden-gems/ingestion/brief-extractor";
import { buildRecord } from "@/lib/hidden-gems/ingestion/record-builder";

const argv = process.argv.slice(2);
function flag(name: string): string | undefined {
  const idx = argv.indexOf(name);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

const briefFile = flag("--file");
const city = flag("--city") ?? "london";
const runId = flag("--run-id") ?? `ingest_${Date.now()}`;
const dryRun = argv.includes("--dry-run");

if (!briefFile) {
  process.stderr.write(
    "Usage: bun run src/scripts/ingest-last30days.ts --file <path> [--city <city>] [--run-id <id>] [--dry-run]\n",
  );
  process.exit(1);
}

const AWS_REGION = process.env.AWS_REGION ?? "eu-west-2";
const HIDDEN_GEMS_TABLE = process.env.HIDDEN_GEMS_TABLE ?? "spontai-hidden-gems";
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!dryRun && (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY)) {
  throw new Error(
    "Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY. Use the seeder IAM key locally, or pass --dry-run.",
  );
}

type DynamoPutRequest = { PutRequest: { Item: Record<string, DynamoAttribute> } };

async function batchWrite(
  client: AwsClient,
  items: Record<string, DynamoAttribute>[],
  isRetry = false,
): Promise<void> {
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
  const failed = (result.UnprocessedItems as Record<string, DynamoPutRequest[]> | undefined)?.[
    HIDDEN_GEMS_TABLE
  ];
  if (failed && failed.length > 0) {
    if (isRetry) {
      throw new Error(`DynamoDB returned UnprocessedItems after retry: ${JSON.stringify(failed)}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    await batchWrite(
      client,
      failed.map((r) => r.PutRequest.Item),
      true,
    );
  }
}

async function main(): Promise<void> {
  const brief = readFileSync(briefFile!, "utf-8");
  const now = new Date();

  const { candidates, platform } = extractCandidatesFromBrief(brief, city, runId);
  console.log(`Extracted ${candidates.length} candidates (platform: ${platform})`);

  if (candidates.length === 0) {
    console.log("No candidates extracted — nothing to write.");
    return;
  }

  // Filter low-confidence candidates before building records
  const qualified = candidates.filter((c) => c.confidence >= 0.3);
  const skipped = candidates.length - qualified.length;
  if (skipped > 0) console.log(`Skipped ${skipped} low-confidence candidate(s)`);

  const records = qualified.map((c) => buildRecord(c, now));
  const items = records.map(toDynamoItem);

  if (dryRun) {
    console.log("--dry-run: would write the following records to DynamoDB:");
    for (const record of records) {
      console.log(`  ${record.place.name} (${record.place.id}) — city: ${record.place.city}`);
    }
    console.log(`Total: ${records.length} record(s)`);
    return;
  }

  const client = new AwsClient({
    accessKeyId: AWS_ACCESS_KEY_ID!,
    secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    region: AWS_REGION,
    service: "dynamodb",
  });

  for (const batch of chunk(items, 25)) {
    await batchWrite(client, batch);
    console.log(`Wrote ${batch.length} record(s)`);
  }

  console.log(
    `Done. Ingested ${items.length} record(s) into ${HIDDEN_GEMS_TABLE} (run-id: ${runId})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

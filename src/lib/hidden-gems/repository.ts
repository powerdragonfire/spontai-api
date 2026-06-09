// src/lib/hidden-gems/repository.ts

// HiddenGemsRepository — the storage seam. The in-memory impl backs the slice, local
// dev, and hermetic tests (zero AWS spend); the Dynamo impl is the production store.
// Both satisfy the same interface so routes/service never know which is behind them.

import type { AwsClient } from "aws4fetch";
import { createDynamoClient, dynamoEndpoint } from "@/lib/dynamo";
import { LONDON_RECORDS } from "@/lib/hidden-gems/seed/london";
import { withBreadcrumb } from "@/middleware/sentry";
import type { HiddenGemRecord } from "@/types/hidden-gems";
import type { AppEnv } from "@/types/hono";

export interface HiddenGemsRepository {
  listAll(): Promise<HiddenGemRecord[]>;
  listByCity(city: string): Promise<HiddenGemRecord[]>;
  getByPlaceId(placeId: string): Promise<HiddenGemRecord | null>;
}

export class InMemoryHiddenGemsRepository implements HiddenGemsRepository {
  private readonly records: readonly HiddenGemRecord[];

  constructor(records: readonly HiddenGemRecord[] = LONDON_RECORDS) {
    this.records = records;
  }

  listAll(): Promise<HiddenGemRecord[]> {
    return Promise.resolve([...this.records]);
  }

  listByCity(city: string): Promise<HiddenGemRecord[]> {
    const c = city.trim().toLowerCase();

    return Promise.resolve(this.records.filter((r) => r.place.city.toLowerCase() === c));
  }

  getByPlaceId(placeId: string): Promise<HiddenGemRecord | null> {
    return Promise.resolve(this.records.find((r) => r.place.id === placeId) ?? null);
  }
}

type DynamoAttributeValue =
  | { S: string }
  | { N: string }
  | { BOOL: boolean }
  | { NULL: true }
  | { M: Record<string, DynamoAttributeValue> }
  | { L: DynamoAttributeValue[] };

type DynamoItem = Record<string, DynamoAttributeValue>;

type GetItemResponse = {
  Item?: DynamoItem;
};

type QueryResponse = {
  Items?: DynamoItem[];
  LastEvaluatedKey?: DynamoItem;
};

function fromDynamoAttr(attr: DynamoAttributeValue): unknown {
  if ("S" in attr) return attr.S;
  if ("N" in attr) return Number(attr.N);
  if ("BOOL" in attr) return attr.BOOL;
  if ("NULL" in attr) return null;

  if ("L" in attr) {
    return attr.L.map(fromDynamoAttr);
  }

  if ("M" in attr) {
    return Object.fromEntries(
      Object.entries(attr.M).map(([key, value]) => [key, fromDynamoAttr(value)]),
    );
  }

  return undefined;
}

function itemToHiddenGemRecord(item?: DynamoItem): HiddenGemRecord | null {
  if (!item) return null;

  /**
   * Preferred seed shape:
   *   record: <full HiddenGemRecord>
   */
  if (item.record) {
    return fromDynamoAttr(item.record) as HiddenGemRecord;
  }

  /**
   * Fallback seed shape:
   *   place
   *   signal
   *   suppression
   *
   * Backwards-compatible with older seed field:
   *   latestSignal
   */
  if (!item.place) {
    return null;
  }

  const signalAttr = item.signal ?? item.latestSignal;

  if (!signalAttr) {
    return null;
  }

  const place = fromDynamoAttr(item.place) as HiddenGemRecord["place"];
  const signal = fromDynamoAttr(signalAttr) as HiddenGemRecord["signal"];

  const suppression = item.suppression
    ? (fromDynamoAttr(item.suppression) as HiddenGemRecord["suppression"])
    : undefined;

  return {
    place,
    signal,
    ...(suppression ? { suppression } : {}),
  };
}

/**
 * Reconstruct the HiddenGemRecords for one page of a city Query, applying the
 * GSI-projection tripwire.
 *
 * Why this exists: queryByCity reads from GSI1. If GSI1 was created with a
 * projection that omits the `record` attribute (e.g. KEYS_ONLY), every Query
 * still SUCCEEDS and returns items — but itemToHiddenGemRecord can rebuild none
 * of them, so /search would surface a silent, empty 200. We would much rather
 * fail loudly so the misconfiguration is caught immediately.
 */
export function reconstructCityItems(items: DynamoItem[]): HiddenGemRecord[] {
  const records: HiddenGemRecord[] = [];

  for (const item of items) {
    const record = itemToHiddenGemRecord(item);
    if (record) records.push(record);
  }

  // GSI-projection tripwire (systemic): items came back but none reconstructed.
  // That's the fingerprint of a KEYS_ONLY/partial GSI1 projection — one bad row
  // wouldn't wipe the whole page, but a missing `record` attribute would. Fail
  // loudly so the misconfiguration can't masquerade as an empty city.
  if (items.length > 0 && records.length === 0) {
    throw new Error(
      `GSI1 returned ${items.length} item(s) but none were reconstructable — ` +
        "check the GSI1 projection includes the `record` attribute (expected projection: ALL).",
    );
  }

  return records;
}

/**
 * Production DynamoDB-backed repository.
 *
 * Single-table key design:
 *   PK=PLACE#<id>
 *   SK=RECORD
 *
 * City GSI:
 *   GSI1PK=CITY#<city>
 *   GSI1SK=SCORE#<zero-padded hiddenGemScore>#PLACE#<id>
 *
 * Querying GSI1 with ScanIndexForward=false returns highest-score gems first.
 */
export class DynamoHiddenGemsRepository implements HiddenGemsRepository {
  private readonly client: AwsClient;
  private readonly tableName: string;

  constructor(private readonly env: AppEnv["Bindings"]) {
    if (!env.HIDDEN_GEMS_TABLE) {
      throw new Error("Missing HIDDEN_GEMS_TABLE binding");
    }

    this.client = createDynamoClient(env);
    this.tableName = env.HIDDEN_GEMS_TABLE;
  }

  async listAll(): Promise<HiddenGemRecord[]> {
    /**
     * Deliberately no DynamoDB Scan here.
     *
     * Your runtime IAM policy only allows:
     *   dynamodb:GetItem
     *   dynamodb:BatchGetItem
     *   dynamodb:Query
     *
     * The launch dataset is London-only, so listAll can safely use the city index.
     * If you later need true global listAll, add an ALL-records GSI or grant Scan.
     */
    return withBreadcrumb(
      "dynamo_hidden_gems_list_all",
      "Listing all hidden gems (London)",
      async () => {
        return this.queryByCity("london");
      },
    );
  }

  async listByCity(city: string): Promise<HiddenGemRecord[]> {
    return withBreadcrumb(
      "dynamo_hidden_gems_list_by_city",
      `Querying hidden gems for city: ${city}`,
      async () => {
        return this.queryByCity(city);
      },
    );
  }

  async getByPlaceId(placeId: string): Promise<HiddenGemRecord | null> {
    return withBreadcrumb(
      "dynamo_hidden_gems_get_by_place_id",
      `Fetching hidden gem by place ID: ${placeId}`,
      async () => {
        const result = await this.dynamo<GetItemResponse>("GetItem", {
          TableName: this.tableName,
          Key: {
            PK: { S: `PLACE#${placeId}` },
            SK: { S: "RECORD" },
          },
        });

        return itemToHiddenGemRecord(result.Item);
      },
    );
  }

  private async queryByCity(city: string): Promise<HiddenGemRecord[]> {
    const normalisedCity = city.trim().toLowerCase();
    const records: HiddenGemRecord[] = [];

    let lastEvaluatedKey: DynamoItem | undefined;

    do {
      const result = await this.dynamo<QueryResponse>("Query", {
        TableName: this.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "#gsi1pk = :city",
        ExpressionAttributeNames: {
          "#gsi1pk": "GSI1PK",
        },
        ExpressionAttributeValues: {
          ":city": { S: `CITY#${normalisedCity}` },
        },
        ScanIndexForward: false,
        ExclusiveStartKey: lastEvaluatedKey,
      });

      records.push(...reconstructCityItems(result.Items ?? []));

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return records;
  }

  private async dynamo<T>(operation: string, body: unknown): Promise<T> {
    const response = await this.client.fetch(dynamoEndpoint(this.env), {
      method: "POST",
      headers: {
        "content-type": "application/x-amz-json-1.0",
        "x-amz-target": `DynamoDB_20120810.${operation}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();

      throw new Error(`DynamoDB ${operation} failed: ${response.status} ${text}`);
    }

    return response.json<T>();
  }
}

/**
 * Select the repository.
 *
 * Tests/CI/local slice:
 *   HIDDEN_GEMS_STORE unset -> in-memory London seed
 *
 * Production:
 *   HIDDEN_GEMS_STORE=dynamo -> DynamoDB
 */
export function createHiddenGemsRepository(env: AppEnv["Bindings"]): HiddenGemsRepository {
  if (env.HIDDEN_GEMS_STORE === "dynamo") {
    return new DynamoHiddenGemsRepository(env);
  }

  return new InMemoryHiddenGemsRepository();
}

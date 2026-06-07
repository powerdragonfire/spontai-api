// HiddenGemsRepository — the storage seam. The in-memory impl backs the slice, local
// dev, and hermetic tests (zero AWS spend); the Dynamo impl is the production store.
// Both satisfy the same interface so routes/service never know which is behind them.

import { LONDON_RECORDS } from "@/lib/hidden-gems/seed/london";
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

/**
 * Production DynamoDB-backed repository (single-table). Deliberately unimplemented in
 * this slice: it needs the AWS bindings + aws4fetch dependency, which are approval-gated.
 * Single-table key design (for when it's built):
 *   PK=PLACE#<id> SK=META|SCORE|SIGNAL#<yyyymmdd>|SUPPRESS
 *   GSI1PK=CITY#<city> GSI1SK=SCORE#<zero-padded hiddenGemScore>  (top-gems-per-city query)
 */
export class DynamoHiddenGemsRepository implements HiddenGemsRepository {
  constructor(private readonly tableName: string) {}

  listAll(): Promise<HiddenGemRecord[]> {
    void this.tableName;
    return Promise.reject(new Error("DynamoHiddenGemsRepository not implemented (gated)"));
  }
  listByCity(): Promise<HiddenGemRecord[]> {
    return Promise.reject(new Error("DynamoHiddenGemsRepository not implemented (gated)"));
  }
  getByPlaceId(): Promise<HiddenGemRecord | null> {
    return Promise.reject(new Error("DynamoHiddenGemsRepository not implemented (gated)"));
  }
}

/**
 * Select the repository. Until the AWS bindings land, this always returns the
 * in-memory store seeded with London. When HIDDEN_GEMS_STORE/HIDDEN_GEMS_TABLE
 * bindings are added (gated step), branch to DynamoHiddenGemsRepository here.
 */
export function createHiddenGemsRepository(_env: AppEnv["Bindings"]): HiddenGemsRepository {
  return new InMemoryHiddenGemsRepository();
}

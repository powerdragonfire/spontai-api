import { describe, expect, it } from "bun:test";
import { reconstructCityItems } from "@/lib/hidden-gems/repository";

// A DynamoDB item whose GSI projected the full `record` attribute (projection = ALL).
// itemToHiddenGemRecord rebuilds the HiddenGemRecord from it.
const projectedItem = {
  record: { M: { place: { M: { id: { S: "lon_test" }, city: { S: "london" } } } } },
};

// A DynamoDB item as it comes back when GSI1 projection is KEYS_ONLY: keys are present
// but `record`/`place` are absent, so it cannot be reconstructed (-> null).
const keysOnlyItem = {
  PK: { S: "PLACE#lon_test" },
  SK: { S: "RECORD" },
  GSI1PK: { S: "CITY#london" },
  placeId: { S: "lon_test" },
};

describe("reconstructCityItems", () => {
  it("returns [] for an empty result set (city legitimately has no gems)", () => {
    expect(reconstructCityItems([])).toEqual([]);
  });

  it("reconstructs records from fully-projected items", () => {
    const records = reconstructCityItems([projectedItem] as never);
    expect(records).toHaveLength(1);
    expect(records[0]?.place.id).toBe("lon_test");
  });

  it("throws when the GSI returns items but none can be reconstructed (bad projection)", () => {
    // This is the misconfiguration tripwire: a KEYS_ONLY/partial GSI projection would
    // otherwise surface as a silent empty 200. It must fail loudly instead.
    expect(() => reconstructCityItems([keysOnlyItem, keysOnlyItem] as never)).toThrow(
      /projection/i,
    );
  });
});

import { describe, expect, it } from "bun:test";
import { chunk, normaliseCity, toAttr, toDynamoItem, zeroPadScore } from "@/lib/dynamo-write";
import { LONDON_RECORDS } from "@/lib/hidden-gems/seed/london";

describe("toAttr", () => {
  it("converts string", () => expect(toAttr("hello")).toEqual({ S: "hello" }));
  it("converts number", () => expect(toAttr(42)).toEqual({ N: "42" }));
  it("converts boolean", () => expect(toAttr(true)).toEqual({ BOOL: true }));
  it("converts null", () => expect(toAttr(null)).toEqual({ NULL: true }));
  it("converts array", () => expect(toAttr(["a", "b"])).toEqual({ L: [{ S: "a" }, { S: "b" }] }));
  it("converts nested object", () => expect(toAttr({ x: 1 })).toEqual({ M: { x: { N: "1" } } }));
});

describe("zeroPadScore", () => {
  it("pads single digit", () => expect(zeroPadScore(7)).toBe("000007"));
  it("pads two digits", () => expect(zeroPadScore(42)).toBe("000042"));
  it("handles max score", () => expect(zeroPadScore(100)).toBe("000100"));
  it("rounds fractional scores", () => expect(zeroPadScore(87.6)).toBe("000088"));
});

describe("normaliseCity", () => {
  it("lowercases and trims", () => expect(normaliseCity("  London  ")).toBe("london"));
});

describe("toDynamoItem", () => {
  it("sets correct PK and SK", () => {
    const record = LONDON_RECORDS[0];
    if (!record) throw new Error("Fixture missing first record");
    const item = toDynamoItem(record);
    expect(item["PK"]).toEqual({ S: `PLACE#${record.place.id}` });
    expect(item["SK"]).toEqual({ S: "RECORD" });
  });

  it("stores non-zero hiddenGemScore for a high-velocity place", () => {
    const highVel = LONDON_RECORDS.find((r) => r.signal.velocity7d > 10);
    if (!highVel) throw new Error("Fixture needs a record with velocity7d > 10");
    const item = toDynamoItem(highVel);
    const gsi1sk = (item["GSI1SK"] as { S: string }).S;
    // Score#000000 would mean the real scoring engine wasn't called
    expect(gsi1sk).not.toContain("SCORE#000000");
  });

  it("stores full record attribute", () => {
    const record = LONDON_RECORDS[0];
    if (!record) throw new Error("Fixture missing first record");
    const item = toDynamoItem(record);
    expect(item["record"]).toBeDefined();
    expect("M" in item["record"]!).toBe(true);
  });

  it("throws on record with empty placeId", () => {
    const bad = {
      ...LONDON_RECORDS[0]!,
      place: { ...LONDON_RECORDS[0]!.place, id: "" },
    };
    expect(() => toDynamoItem(bad)).toThrow(/place\.id/);
  });
});

describe("chunk", () => {
  it("splits array into chunks of given size", () => {
    const result = chunk([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns single chunk when size >= length", () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });
});

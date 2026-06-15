import { describe, expect, it } from "bun:test";
import { cityCentroid } from "@/lib/hidden-gems/ingestion/city-centroids";

describe("cityCentroid", () => {
  it("returns London coordinates", () => {
    const { lat, lng } = cityCentroid("London");
    expect(lat).toBeCloseTo(51.5074, 2);
    expect(lng).toBeCloseTo(-0.1278, 2);
  });

  it("is case-insensitive", () => {
    expect(cityCentroid("LONDON")).toEqual(cityCentroid("london"));
  });

  it("trims whitespace", () => {
    expect(cityCentroid("  London  ")).toEqual(cityCentroid("london"));
  });

  it("returns zero-zero for unknown city", () => {
    const { lat, lng } = cityCentroid("atlantis");
    expect(lat).toBe(0);
    expect(lng).toBe(0);
  });
});

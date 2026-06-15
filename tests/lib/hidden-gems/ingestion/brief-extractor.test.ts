import { describe, expect, it } from "bun:test";
import { extractCandidatesFromBrief } from "@/lib/hidden-gems/ingestion/brief-extractor";

const FIXTURE_BRIEF = `🌐 last30days v3.3.2 · synced 2026-06-09

What I learned:

**Norma's Coffee in Peckham is genuinely blowing up** - Local TikTok creators have been posting about this Peckham cafe with high save intent. Comments asking "where is this?" and "drop the addy" are surging. 340% week-over-week velocity in the last 7 days.

**Silo Bakehouse is gaining serious momentum** - This Hackney Wick spot keeps appearing in food creator content. Local creators dominating. Strong 120% wow growth.

**Lassco Brunswick House** is showing tourist creator saturation - mainstream coverage is rising rapidly.

KEY PATTERNS from the research:
1. South London cafes dominating local TikTok discovery
2. Location-seeking comments indicate genuinely undiscovered spots

---
✅ All agents reported back! 🌐 Web: 23 sources · 📱 TikTok: 8 posts · 📸 IG: 4 posts
`;

describe("extractCandidatesFromBrief", () => {
  it("extracts at least 2 candidates from fixture brief", () => {
    const { candidates } = extractCandidatesFromBrief(FIXTURE_BRIEF, "London", "run_001");
    expect(candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("extracted candidates include Norma's Coffee", () => {
    const { candidates } = extractCandidatesFromBrief(FIXTURE_BRIEF, "London", "run_001");
    const names = candidates.map((c) => c.placeNameRaw.toLowerCase());
    expect(names.some((n) => n.includes("norma"))).toBe(true);
  });

  it("all candidates have city and runId set correctly", () => {
    const { candidates } = extractCandidatesFromBrief(FIXTURE_BRIEF, "London", "run_001");
    for (const c of candidates) {
      expect(c.city).toBe("London");
      expect(c.sourceRunId).toBe("run_001");
      expect(c.status).toBe("unresolved");
    }
  });

  it("detects TikTok platform from brief text", () => {
    const { platform } = extractCandidatesFromBrief(FIXTURE_BRIEF, "London", "run_001");
    expect(platform).toBe("tiktok");
  });

  it("save-intent text boosts saveIntentScore above 0.5 for Norma's paragraph", () => {
    const { candidates } = extractCandidatesFromBrief(FIXTURE_BRIEF, "London", "run_001");
    const normas = candidates.find((c) => c.placeNameRaw.toLowerCase().includes("norma"));
    expect(normas).toBeDefined();
    expect(normas!.extractedSignals?.saveIntentScore).toBeGreaterThan(0.5);
  });

  it("first candidate has non-zero velocity7d", () => {
    const { candidates } = extractCandidatesFromBrief(FIXTURE_BRIEF, "London", "run_001");
    const first = candidates[0];
    expect(first).toBeDefined();
    expect(first!.extractedSignals?.velocity7d ?? 0).toBeGreaterThan(0);
  });
});

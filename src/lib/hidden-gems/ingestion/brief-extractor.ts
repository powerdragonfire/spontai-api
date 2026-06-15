// src/lib/hidden-gems/ingestion/brief-extractor.ts
// Converts a last30days markdown brief into HiddenGemCandidate[] by running
// TextContentExtractor on each paragraph and estimating signal strength from
// velocity numbers, intent patterns, and paragraph position.

import { TextContentExtractor } from "@/lib/hidden-gems/providers/content-extraction";
import type { SourcePlatform } from "@/types/hidden-gems";
import type { HiddenGemCandidate, RawSignalData } from "@/types/ingestion";

const VELOCITY_RE =
  /(\d+(?:\.\d+)?)\s*%?\s*(?:week(?:[- ]over[- ]week|ly)|wow|velocity|growth|surge|rise)/i;
const MENTION_RE = /(\d+)\s*(?:mentions?|posts?|videos?|clips?|reels?)/i;
const SAVE_INTENT_RE = /\b(?:save|bookmark|screenshot|screenshotted|wish[- ]?list)\b/i;
const LOCATION_INTENT_RE =
  /\b(?:where\s+is\s+this|location\??|drop\s+the\s+(?:addy|address)|whereabouts)\b/i;
const LOCAL_RE = /\b(?:local\s+creator|locals?|from\s+the\s+area|neighbourhood)\b/i;

function detectPlatform(brief: string): SourcePlatform {
  if (/tiktok/i.test(brief)) return "tiktok";
  if (/instagram|reels?/i.test(brief)) return "instagram";
  if (/youtube/i.test(brief)) return "youtube";
  return "unknown";
}

function extractSignals(text: string, rank: number, total: number): Partial<RawSignalData> {
  // Position-based score: candidates appearing earlier in the brief rank higher
  const pos = Math.max(0.1, (total - rank + 1) / total);

  const velocityMatch = text.match(VELOCITY_RE);
  const mentionMatch = text.match(MENTION_RE);

  // A "340% wow" figure → divide by 10 to get approx mentions/day; cap at 25
  const rawVelocity = velocityMatch ? parseFloat(velocityMatch[1] ?? "0") : pos * 15;
  const velocity7d = parseFloat(
    Math.min(rawVelocity > 100 ? rawVelocity / 10 : rawVelocity, 25).toFixed(1),
  );

  const mentionCount7d = mentionMatch ? parseInt(mentionMatch[1] ?? "0") : Math.round(pos * 20);

  return {
    mentionCount7d,
    mentionCount30d: Math.round(mentionCount7d * 2.5),
    velocity7d,
    velocity30d: parseFloat((velocity7d * 0.6).toFixed(2)),
    engagementScore: parseFloat((0.4 + pos * 0.3).toFixed(2)),
    saveIntentScore: SAVE_INTENT_RE.test(text) ? 0.65 : parseFloat((0.2 + pos * 0.1).toFixed(2)),
    commentIntentScore: LOCATION_INTENT_RE.test(text)
      ? 0.58
      : parseFloat((0.15 + pos * 0.1).toFixed(2)),
    creatorDensity: parseFloat((0.15 + pos * 0.2).toFixed(2)),
    localCreatorRatio: LOCAL_RE.test(text) ? 0.72 : parseFloat((0.45 + pos * 0.15).toFixed(2)),
    touristCreatorRatio: parseFloat((0.15 + (1 - pos) * 0.1).toFixed(2)),
  };
}

export interface BriefExtractionResult {
  candidates: HiddenGemCandidate[];
  city: string;
  runId: string;
  platform: SourcePlatform;
}

export function extractCandidatesFromBrief(
  briefMarkdown: string,
  city: string,
  runId: string,
): BriefExtractionResult {
  const extractor = new TextContentExtractor();
  const platform = detectPlatform(briefMarkdown);

  const paragraphs = briefMarkdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(
      (p) =>
        p.length > 20 &&
        !p.startsWith("🌐") &&
        !p.startsWith("---") &&
        !p.startsWith("✅") &&
        !p.startsWith("KEY PATTERNS"),
    );

  // Collect all candidates keyed by normalised name, preserving first-seen paragraph
  const seen = new Map<
    string,
    { name: string; paraText: string; confidence: number; evidence: string[] }
  >();

  for (const para of paragraphs) {
    for (const cand of extractor.extract({ caption: para })) {
      const key = cand.name.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, {
          name: cand.name,
          paraText: para,
          confidence: cand.confidence,
          evidence: [...cand.evidence],
        });
      }
    }
  }

  const total = seen.size;
  const candidates: HiddenGemCandidate[] = [];
  let rank = 0;

  for (const [, { name, paraText, confidence, evidence }] of seen) {
    rank++;
    candidates.push({
      id: `${runId}_${rank}`,
      placeNameRaw: name,
      city,
      sourcePlatform: platform,
      sourceRunId: runId,
      sourceText: paraText.slice(0, 500),
      extractedSignals: extractSignals(paraText, rank, total),
      status: "unresolved",
      confidence,
      evidence,
    });
  }

  return { candidates, city, runId, platform };
}

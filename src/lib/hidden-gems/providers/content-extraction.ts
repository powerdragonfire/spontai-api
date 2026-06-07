// v1 text-based content extraction: pull candidate place names from caption +
// comments. NO server-side scraping of the social URL (ToS/legal) — we only
// process text the client already supplies. OCR / video-frame analysis is future work.

import type {
  ContentExtractionInput,
  ContentExtractionProvider,
  ExtractedCandidate,
} from "@/lib/hidden-gems/providers/types";

// Words that often precede a venue name in captions ("at Norma's", "spot called X").
const NAME_LEAD = /(?:at|@|called|named|visit(?:ed)?|spot|place|cafe|café|bar|restaurant)\s+/i;
// A run of 1–4 Capitalised words, allowing 's, &, and small joiners.
const PROPER_NOUN = /\b([A-Z][\w'’&-]+(?:\s+(?:[A-Z][\w'’&-]+|&|of|the|and)){0,3})\b/g;
const STOPWORDS = new Set([
  "I",
  "The",
  "This",
  "London",
  "Today",
  "Here",
  "My",
  "We",
  "You",
  "Best",
  "Hidden",
  "Gem",
]);
const LOCATION_QUESTION =
  /where\s+is\s+this|location\??|drop\s+the\s+(?:addy|address|spot)|whereabouts/i;

interface Acc {
  displayName: string;
  evidence: string[];
  sources: Set<string>;
}

export class TextContentExtractor implements ContentExtractionProvider {
  extract(input: ContentExtractionInput): ExtractedCandidate[] {
    const byKey = new Map<string, Acc>();

    const add = (raw: string, source: string, evidence: string): void => {
      const name = raw.trim().replace(/\s+/g, " ");
      if (name.length < 3 || STOPWORDS.has(name)) return;
      const key = name.toLowerCase();
      const existing = byKey.get(key);
      if (existing) {
        existing.sources.add(source);
        if (!existing.evidence.includes(evidence)) existing.evidence.push(evidence);
      } else {
        byKey.set(key, { displayName: name, evidence: [evidence], sources: new Set([source]) });
      }
    };

    const harvest = (text: string, source: string, label: string): void => {
      const lead = text.match(new RegExp(NAME_LEAD.source + PROPER_NOUN.source, "gi"));
      if (lead) {
        for (const m of lead) add(m.replace(NAME_LEAD, "").trim(), source, label);
      }
      for (const m of text.matchAll(PROPER_NOUN)) {
        if (m[1]) add(m[1], source, label);
      }
    };

    if (input.caption) harvest(input.caption, "caption", "caption mention");

    let locationIntent = false;
    for (const comment of input.comments ?? []) {
      if (LOCATION_QUESTION.test(comment)) {
        locationIntent = true;
        continue; // "where is this?" signals intent, not a name
      }
      harvest(comment, "comment", "comment mention");
    }

    const candidates: ExtractedCandidate[] = [];
    for (const acc of byKey.values()) {
      // Confidence rises with distinct sources; location-intent comments add a nudge.
      const base = Math.min(0.6, 0.35 + 0.25 * (acc.sources.size - 1));
      const confidence = Math.min(1, Number((base + (locationIntent ? 0.2 : 0)).toFixed(2)));
      const evidence = [...acc.evidence];
      if (locationIntent) evidence.push("comments asking for location");
      candidates.push({ name: acc.displayName, confidence, evidence });
    }
    return candidates.sort((a, b) => b.confidence - a.confidence);
  }
}

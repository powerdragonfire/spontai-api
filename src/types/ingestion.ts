// src/types/ingestion.ts
// Types for the last30days ingestion pipeline.
// HiddenGemCandidate is an unresolved place extracted from a research brief,
// carrying estimated social signals before POI resolution.

import type { PlaceCategory, SourcePlatform } from "@/types/hidden-gems";

export type CandidateStatus = "unresolved" | "resolved" | "rejected" | "needs_review";

/** Raw signal numbers extracted from a research brief, before normalisation. */
export interface RawSignalData {
  mentionCount7d: number;
  mentionCount30d: number;
  /** New mentions/day velocity over the trailing 7d window. */
  velocity7d: number;
  /** New mentions/day velocity over the trailing 30d window. */
  velocity30d: number;
  /** 0..1 engagement estimate (likes/comments/shares per mention). */
  engagementScore: number;
  /** 0..1 "save/bookmark" intent share. */
  saveIntentScore: number;
  /** 0..1 "where is this?" comment share. */
  commentIntentScore: number;
  /** 0..1 creator density estimate. */
  creatorDensity: number;
  /** 0..1 local creator ratio estimate. */
  localCreatorRatio: number;
  /** 0..1 tourist creator ratio estimate. */
  touristCreatorRatio: number;
}

/** An unresolved place candidate extracted from a last30days research brief. */
export interface HiddenGemCandidate {
  id: string;
  /** Raw place name as extracted from the brief text (not yet validated). */
  placeNameRaw: string;
  city: string;
  neighbourhood?: string;
  category?: PlaceCategory;
  sourcePlatform: SourcePlatform;
  /** ID of the research run that produced this candidate. */
  sourceRunId?: string;
  /** Excerpt of source paragraph (max 500 chars). */
  sourceText?: string;
  /** Partially-known signal data estimated from the brief. */
  extractedSignals?: Partial<RawSignalData>;
  status: CandidateStatus;
  /** 0..1 extraction confidence from TextContentExtractor. */
  confidence: number;
  evidence: string[];
}

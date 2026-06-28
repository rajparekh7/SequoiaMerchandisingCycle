// Core domain types for the Sequoia Merchandising Cycle analyzer.
// Stage order encodes the cycle: 1 = Vision (most upstream) ... 5 = Sales (most downstream).
// The whole product hinges on "upstream", so `order` is load-bearing — see rootCause.ts.

export type StageId =
  | "vision"
  | "product_management"
  | "product_marketing"
  | "demand_generation"
  | "sales";

export type Flag = "red" | "yellow" | "green";

/** Was this score computed on a complete crawl, or a partial one (robots.txt / slow site)? */
export type Confidence = "full" | "partial";

export interface StageMeta {
  id: StageId;
  /** 1 = most upstream (Vision), 5 = most downstream (Sales). */
  order: number;
  label: string;
}

/** Stage metadata in upstream→downstream order. The single source of truth for ordering. */
export const STAGES: readonly StageMeta[] = [
  { id: "vision", order: 1, label: "Vision" },
  { id: "product_management", order: 2, label: "Product Management" },
  { id: "product_marketing", order: 3, label: "Product Marketing" },
  { id: "demand_generation", order: 4, label: "Demand Generation" },
  { id: "sales", order: 5, label: "Sales" },
] as const;

export function stageMeta(id: StageId): StageMeta {
  const m = STAGES.find((s) => s.id === id);
  if (!m) throw new Error(`Unknown stage: ${id}`);
  return m;
}

export type PageType =
  | "homepage"
  | "pricing"
  | "about"
  | "product"
  | "blog_index"
  | "blog_post"
  | "case_study"
  | "docs"
  | "careers"
  | "other";

export interface CrawledPage {
  url: string;
  type: PageType;
  /** Cleaned markdown (as Firecrawl returns). */
  markdown: string;
  /** Word count of the markdown; computed if omitted. */
  wordCount?: number;
}

/**
 * The deterministic heart of reproducibility (§4.2): structural heuristics compute a
 * hard band that the final score MUST fall within. The LLM only places the score inside it.
 */
export interface ScoreBand {
  low: number; // floor (0–100)
  high: number; // ceiling (0–100)
  reasons: string[]; // human-readable explanations for the caps/floors applied
}

/** Raw output of the qualitative layer (LLM or mock) BEFORE band clamping. */
export interface RawStageResult {
  score: number; // 0–100, pre-clamp
  evidence: string[];
  bottleneckConfidence: number; // 0–1
  rootCauseProbability: number; // 0–1
}

export interface StageScore {
  stage: StageId;
  score: number; // 0–100, post-clamp — guaranteed within band
  flag: Flag;
  band: ScoreBand;
  evidence: string[];
  bottleneckConfidence: number;
  rootCauseProbability: number;
  confidence: Confidence;
}

export type RootCauseKind = "root_cause" | "priority_fix" | "healthy";

export interface RootCause {
  kind: RootCauseKind;
  /** The diagnosed stage (absent when the cycle is healthy). */
  stage?: StageId;
  /** One-line bottom-line for the exec summary. */
  bottomLine: string;
  /** Downstream stages that are likely SYMPTOMS of `stage`, not independent problems. */
  downstreamSymptoms: StageId[];
}

export type Difficulty = "low" | "medium" | "high";

export interface Recommendation {
  stage: StageId;
  finding: string;
  actions: string[];
  difficulty: Difficulty;
}

export interface Report {
  url: string;
  generatedAt: string; // ISO; injected by the caller (engine is deterministic, no clock)
  overallFlag: Flag;
  rootCause: RootCause;
  stages: StageScore[]; // in upstream→downstream order
  recommendations: Recommendation[]; // ordered by upstream dependency (fix Vision first)
  partialCrawl: boolean;
}

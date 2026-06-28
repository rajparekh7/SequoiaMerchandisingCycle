// Orchestrator (PRD §6.2). For each stage: deterministic band → routed pages → LLM places
// score in band → clamp → flag. Then the upstream-root-cause rule and recommendations.
//
// The engine takes no clock and no randomness — `generatedAt` is injected by the caller —
// so given the same pages and the same scorer it is fully deterministic.

import { bandFor } from "./heuristics.ts";
import type { StageScorer } from "./llm.ts";
import { routePages } from "./pageRouter.ts";
import { buildRecommendations } from "./recommendations.ts";
import { computeRootCause, overallFlag } from "./rootCause.ts";
import { clampToBand, flagFor } from "./scorer.ts";
import { STAGES } from "./types.ts";
import type { Confidence, CrawledPage, Report, StageScore } from "./types.ts";

export interface AnalyzeInput {
  url: string;
  pages: CrawledPage[];
  scorer: StageScorer;
  /** ISO timestamp injected by the caller (keeps the engine deterministic). */
  generatedAt: string;
  /** True if the crawl was blocked/slow and pages are incomplete (PRD §4.1). */
  partialCrawl?: boolean;
  /** Optional progress hook for the async-job status stream (PRD §7.2). Fired as each
   *  stage resolves; order is non-deterministic because stages score in parallel. */
  onProgress?: (label: string) => void;
}

export async function analyze(input: AnalyzeInput): Promise<Report> {
  const { url, pages, scorer, generatedAt, partialCrawl = false, onProgress } = input;
  const confidence: Confidence = partialCrawl ? "partial" : "full";

  // Score stages in parallel (5 independent LLM calls), preserving cycle order in output.
  const stages: StageScore[] = await Promise.all(
    STAGES.map(async (meta): Promise<StageScore> => {
      const band = bandFor(meta.id, pages);
      const routed = routePages(meta.id, pages);
      const raw = await scorer.score({ stage: meta.id, pages: routed, band });
      const score = clampToBand(raw.score, band);
      onProgress?.(`Scored ${meta.label}`);
      return {
        stage: meta.id,
        score,
        flag: flagFor(score),
        band,
        evidence: raw.evidence,
        bottleneckConfidence: raw.bottleneckConfidence,
        rootCauseProbability: raw.rootCauseProbability,
        confidence,
      };
    }),
  );

  return {
    url,
    generatedAt,
    overallFlag: overallFlag(stages),
    rootCause: computeRootCause(stages),
    stages, // already in upstream→downstream order (STAGES order)
    recommendations: buildRecommendations(stages),
    partialCrawl,
  };
}

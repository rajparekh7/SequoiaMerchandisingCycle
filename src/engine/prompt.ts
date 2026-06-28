// Prompt + structured-output schema builder (PRD §6.3, §12).
//
// Key choices that make scores reproducible & cheap:
//  - The rubric + system framing is IDENTICAL across all 5 calls and every report, so it
//    sits behind a `cache_control` breakpoint (cache reads ~0.1× input).
//  - The heuristic band is injected into the prompt: the model is told the score MUST fall
//    within [band.low, band.high] and only decides where inside it.
//  - `output_config.format` pins a JSON schema, so the response is validated to the exact
//    shape — no regex/string parsing of model output.
//  - No `temperature` is set: claude-opus-4-8 removes sampling params (would 400).
//    Reproducibility comes from the band + point-anchored rubric + structured output.

import { RUBRICS } from "./rubric.ts";
import { stageMeta } from "./types.ts";
import type { CrawledPage, ScoreBand, StageId } from "./types.ts";

export const DEFAULT_MODEL = "claude-opus-4-8";

/** JSON schema for output_config.format. No numeric min/max (unsupported by structured
 *  outputs) — ranges are validated client-side after parsing. */
export const STAGE_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "flag", "evidence", "bottleneck_confidence", "root_cause_probability"],
  properties: {
    score: { type: "integer" },
    flag: { type: "string", enum: ["red", "yellow", "green"] },
    evidence: { type: "array", items: { type: "string" } },
    bottleneck_confidence: { type: "number" },
    root_cause_probability: { type: "number" },
  },
} as const;

function rubricText(stage: StageId): string {
  return RUBRICS[stage].map((c) => `  +${c.points}  ${c.label}`).join("\n");
}

function pagesText(pages: CrawledPage[]): string {
  if (pages.length === 0) return "(no relevant pages were crawled for this stage)";
  return pages
    .map((p) => `### ${p.type} — ${p.url}\n${p.markdown.trim().slice(0, 6000)}`)
    .join("\n\n");
}

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  system: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;
  output_config: { format: { type: "json_schema"; schema: unknown } };
  messages: Array<{ role: "user"; content: string }>;
}

/**
 * Build the Anthropic Messages request for one stage. The stable system+rubric block
 * carries the cache breakpoint; the volatile per-site content goes in the user message.
 */
export function buildStageRequest(args: {
  stage: StageId;
  pages: CrawledPage[];
  band: ScoreBand;
  model?: string;
}): AnthropicRequestBody {
  const { stage, pages, band, model = DEFAULT_MODEL } = args;
  const meta = stageMeta(stage);

  const stableSystem =
    `You are an expert product marketer evaluating a B2B SaaS website against Doug Leone's ` +
    `Sequoia Merchandising Cycle. You score the "${meta.label}" stage from 0–100 using this ` +
    `point-anchored rubric (award points only for criteria the evidence clearly supports):\n\n` +
    `${rubricText(stage)}\n\n` +
    `Flag: <50 = red (critical gap), 50–79 = yellow (weak link), 80+ = green (solid). ` +
    `Cite 2–4 concrete evidence bullets quoting or naming what you found (or what's missing). ` +
    `bottleneck_confidence and root_cause_probability are 0–1.`;

  const volatile =
    `STRUCTURAL HEURISTICS have already bounded this stage's score to the range ` +
    `[${band.low}, ${band.high}]${band.reasons.length ? ` because:\n- ${band.reasons.join("\n- ")}` : "."}\n` +
    `Your score MUST fall within [${band.low}, ${band.high}]. Decide where inside that range.\n\n` +
    `PAGES FOR THIS STAGE:\n\n${pagesText(pages)}`;

  return {
    model,
    max_tokens: 1024,
    system: [{ type: "text", text: stableSystem, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: STAGE_OUTPUT_SCHEMA } },
    messages: [{ role: "user", content: volatile }],
  };
}

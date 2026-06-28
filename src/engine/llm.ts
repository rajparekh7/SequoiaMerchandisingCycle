// The qualitative scoring layer behind an interface, so the deterministic engine is
// fully testable without API keys or network. Tests use MockStageScorer;
// production uses AnthropicStageScorer (network-gated, only with a key).

import { buildStageRequest, DEFAULT_MODEL } from "./prompt.ts";
import type { CrawledPage, RawStageResult, ScoreBand, StageId } from "./types.ts";

export interface ScoreArgs {
  stage: StageId;
  pages: CrawledPage[];
  band: ScoreBand;
}

export interface StageScorer {
  score(args: ScoreArgs): Promise<RawStageResult>;
}

/**
 * Deterministic scorer for tests/CI and the offline demo. Picks the band midpoint and
 * derives stable confidences from the band, so repeated runs are byte-identical — this is
 * what the reproducibility regression gate asserts against (PRD §4.2, §9).
 */
export class MockStageScorer implements StageScorer {
  async score({ band, stage }: ScoreArgs): Promise<RawStageResult> {
    const mid = Math.round((band.low + band.high) / 2);
    const narrowness = 1 - (band.high - band.low) / 100; // tighter band → higher confidence
    return {
      score: mid,
      evidence:
        band.reasons.length > 0
          ? band.reasons.slice(0, 4)
          : [`No structural red flags detected for ${stage}; scored at band midpoint.`],
      bottleneckConfidence: Number((0.5 + 0.4 * narrowness).toFixed(2)),
      rootCauseProbability: Number(((100 - mid) / 100).toFixed(2)),
    };
  }
}

/** Adversarial scorer for tests: returns out-of-range values to prove clamping bounds them. */
export class FixedStageScorer implements StageScorer {
  readonly raw: number;
  constructor(raw: number) {
    this.raw = raw;
  }
  async score(): Promise<RawStageResult> {
    return { score: this.raw, evidence: ["fixed"], bottleneckConfidence: 0.5, rootCauseProbability: 0.5 };
  }
}

/** Production scorer — calls the Anthropic Messages API with structured outputs.
 *  Network-gated: constructing without a key throws, so it's never hit in tests. */
export class AnthropicStageScorer implements StageScorer {
  readonly apiKey: string;
  readonly model: string;
  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    if (!apiKey) throw new Error("AnthropicStageScorer requires an API key (set ANTHROPIC_API_KEY).");
    this.apiKey = apiKey;
    this.model = model;
  }

  async score({ stage, pages, band }: ScoreArgs): Promise<RawStageResult> {
    const body = buildStageRequest({ stage, pages, band, model: this.model });
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((b) => b.type === "text")?.text ?? "{}";
    const parsed = JSON.parse(text) as {
      score: number;
      evidence: string[];
      bottleneck_confidence: number;
      root_cause_probability: number;
    };
    return {
      score: parsed.score,
      evidence: parsed.evidence ?? [],
      bottleneckConfidence: parsed.bottleneck_confidence ?? 0,
      rootCauseProbability: parsed.root_cause_probability ?? 0,
    };
  }
}

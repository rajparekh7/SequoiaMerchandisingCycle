// Recommendation playbook (PRD §4.4). One prioritized rec per gap stage, ordered
// upstream-first to match the root-cause rule (§4.3).

import { fixOrder } from "./rootCause.ts";
import { stageMeta } from "./types.ts";
import type { Difficulty, Recommendation, StageId, StageScore } from "./types.ts";

interface PlaybookEntry {
  finding: (s: StageScore) => string;
  actions: string[];
  difficulty: Difficulty;
}

const PLAYBOOK: Record<StageId, PlaybookEntry> = {
  vision: {
    finding: () =>
      "The About page doesn't name a specific ICP or the economic problem you solve — the market thesis reads as generic mission language.",
    actions: [
      "Rewrite the About page to name the exact ICP (role + segment) and the dollar problem you remove.",
      "Cut generic mission statements; replace with a defensible 'why now' for this market.",
    ],
    difficulty: "low",
  },
  product_management: {
    finding: () =>
      "Prospects can't self-qualify: no public changelog, thin docs, or unclear supported use cases.",
    actions: [
      "Publish a public changelog and a use-case matrix so buyers can self-qualify.",
      "Add a docs/help center entry point from the top nav.",
    ],
    difficulty: "medium",
  },
  product_marketing: {
    finding: (s) =>
      `The story isn't crisp — ${s.band.reasons.find((r) => /H1|case stud|different ways/i.test(r)) ?? "the value prop fails the 3-word test"}`,
    actions: [
      "Rewrite the homepage H1 to pass the 3-word test: an outcome in ≤10 words, no jargon.",
      "Add ≥2 case studies that name the ICP and a concrete ROI number.",
      "Pick ONE noun for the product and use it consistently across every page.",
    ],
    difficulty: "medium",
  },
  demand_generation: {
    finding: () =>
      "Top-of-funnel is starved: little blog cadence and no gated asset to convert readers into leads.",
    actions: [
      "Ship a gated teardown or annual report to convert blog traffic into leads.",
      "Establish a weekly content cadence — BDRs can't 10× if top-of-funnel stays flat.",
    ],
    difficulty: "medium",
  },
  sales: {
    finding: () =>
      "The buying path is opaque — no transparent pricing and/or no self-serve start. 'Contact Sales' is a wall, not a door, for sub-$50k ACV buyers.",
    actions: [
      "Add transparent, self-serve pricing with visible numbers and plan tiers.",
      "Offer a self-serve start (free trial or sign-up) alongside the demo request.",
    ],
    difficulty: "high",
  },
};

export function buildRecommendations(stages: StageScore[]): Recommendation[] {
  const order = fixOrder(stages); // upstream-first
  const byStage = new Map(stages.map((s) => [s.stage, s]));
  return order.map((id) => {
    const entry = PLAYBOOK[id];
    const score = byStage.get(id)!;
    return {
      stage: id,
      finding: `${stageMeta(id).label}: ${entry.finding(score)}`,
      actions: entry.actions,
      difficulty: entry.difficulty,
    };
  });
}

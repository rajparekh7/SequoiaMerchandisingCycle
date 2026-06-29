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

// Prescriptions track the KB's "How to Fix It" per stage (docs/sequoia-merchandising-cycle.md).
const PLAYBOOK: Record<StageId, PlaybookEntry> = {
  vision: {
    finding: () =>
      "The vision reads as vague mission language — no specific ICP, no urgent economic problem, no point of view anyone could disagree with.",
    actions: [
      "Narrow the ICP until it feels uncomfortable — the segment you can name 50 companies for.",
      "Replace generic mission with the urgent, expensive problem you remove (a painkiller, not a vitamin).",
      "Stake a clear point of view someone could argue with — vague vision is weak vision.",
    ],
    difficulty: "low",
  },
  product_management: {
    finding: () =>
      "Prospects can't self-qualify or trust the product: no public roadmap/changelog, thin docs, or missing reliability signals.",
    actions: [
      "Publish a public roadmap and dated changelog — it forces prioritization and proves momentum.",
      "Kill features serving non-ICP customers; document a 'best fit' and an explicit 'not a fit'.",
      "Surface reliability/trust signals (SOC 2, status/uptime, security) and a real docs/help center.",
    ],
    difficulty: "medium",
  },
  product_marketing: {
    finding: (s) =>
      `The story isn't crisp — ${s.band.reasons.find((r) => /H1|case stud|different ways/i.test(r)) ?? "the value prop fails the 3-word test"}`,
    actions: [
      "Rewrite the H1 with the Jobs framework — the painful job the customer hires you for, ≤10 words, no buzzwords.",
      "Enforce one source-of-truth message across homepage, deck, demo, and onboarding.",
      "Add one case study per ICP segment with a quantified headline (outcome, not 'loves us').",
    ],
    difficulty: "medium",
  },
  demand_generation: {
    finding: () =>
      "Top-of-funnel is starved: thin blog cadence and no gated asset to convert anonymous readers into known leads.",
    actions: [
      "Ship one genuinely useful lead magnet per ICP segment (a teardown or annual report, not a brochure).",
      "Master one channel before diversifying, and add email capture on every content page.",
      "Define the ICP so specifically a new BDR knows who NOT to call.",
    ],
    difficulty: "medium",
  },
  sales: {
    finding: () =>
      "The buying path is opaque — no transparent pricing and/or no self-serve start. 'Contact Sales' is a wall, not a door, for sub-$50k ACV buyers.",
    actions: [
      "Add transparent self-serve pricing for sub-$50k buyers; reserve Sales for expansion and enterprise.",
      "Build a repeatable demo and a 'getting started' page that explains the buying journey.",
      "Document objection-handling by actual customer concern, not by product feature.",
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

// The headline v2 fix (PRD §4.3): the Leone UPSTREAM-root-cause rule.
//
// v1-draft said "start at Sales, walk up, stop at the first 🔴" — which finds the most
// DOWNSTREAM broken stage and contradicts the product's own thesis ("the bottleneck is
// almost always upstream"). Corrected here:
//
//   Root cause = the FURTHEST-UPSTREAM 🔴 (lowest stage `order`).
//   A downstream 🔴 sitting beneath an upstream 🔴 is a SYMPTOM, not the cause.
//   No 🔴? The lowest-scoring 🟡 (furthest upstream on ties) is the Priority Fix.
//   All 🟢? The cycle is healthy publicly.

import { stageMeta } from "./types.ts";
import type { RootCause, StageId, StageScore } from "./types.ts";

function byOrder(a: StageScore, b: StageScore): number {
  return stageMeta(a.stage).order - stageMeta(b.stage).order;
}

/** Stages strictly downstream of `stage` that are not green — likely symptoms of it. */
function downstreamSymptoms(stage: StageId, stages: StageScore[]): StageId[] {
  const rootOrder = stageMeta(stage).order;
  return stages
    .filter((s) => stageMeta(s.stage).order > rootOrder && s.flag !== "green")
    .sort(byOrder)
    .map((s) => s.stage);
}

export function computeRootCause(stages: StageScore[]): RootCause {
  const reds = stages.filter((s) => s.flag === "red").sort(byOrder);

  if (reds.length > 0) {
    const root = reds[0]!; // furthest upstream red
    const meta = stageMeta(root.stage);
    const symptoms = downstreamSymptoms(root.stage, stages);
    const tail =
      symptoms.length > 0
        ? ` Downstream stages (${symptoms.map((s) => stageMeta(s).label).join(", ")}) are likely starved by this, not broken on their own.`
        : "";
    return {
      kind: "root_cause",
      stage: root.stage,
      bottomLine: `${meta.label} is the probable root cause (critical gap at the most upstream broken stage).${tail}`,
      downstreamSymptoms: symptoms,
    };
  }

  const yellows = stages
    .filter((s) => s.flag === "yellow")
    .sort((a, b) => a.score - b.score || byOrder(a, b)); // lowest score, then furthest upstream

  if (yellows.length > 0) {
    const fix = yellows[0]!;
    const meta = stageMeta(fix.stage);
    return {
      kind: "priority_fix",
      stage: fix.stage,
      bottomLine: `No critical gaps, but ${meta.label} is the weakest link and will cap growth first — fix it before it turns red.`,
      downstreamSymptoms: downstreamSymptoms(fix.stage, stages),
    };
  }

  return {
    kind: "healthy",
    bottomLine:
      "The cycle is healthy publicly. If growth is still stalled, look at (a) internal ops / churn, or (b) the vision may be right but the market is smaller than assumed.",
    downstreamSymptoms: [],
  };
}

/** Worst flag present across the cycle, for the exec-summary overall health. */
export function overallFlag(stages: StageScore[]): StageScore["flag"] {
  if (stages.some((s) => s.flag === "red")) return "red";
  if (stages.some((s) => s.flag === "yellow")) return "yellow";
  return "green";
}

/** Stages a recommendation panel should address, ordered upstream-first (fix Vision first). */
export function fixOrder(stages: StageScore[]): StageId[] {
  return [...stages]
    .filter((s) => s.flag !== "green")
    .sort(byOrder)
    .map((s) => s.stage);
}

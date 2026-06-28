// Score clamping + flagging. The clamp is what bounds LLM variance into the
// deterministic heuristic band (PRD §4.2) — an adversarial or jittery model output
// of 0 or 100 still lands inside the band the heuristics fixed.

import { FLAG_THRESHOLDS } from "./rubric.ts";
import type { Flag, ScoreBand } from "./types.ts";

export function clampToBand(rawScore: number, band: ScoreBand): number {
  const rounded = Math.round(rawScore);
  return Math.max(band.low, Math.min(band.high, rounded));
}

export function flagFor(score: number): Flag {
  if (score < FLAG_THRESHOLDS.red) return "red";
  if (score < FLAG_THRESHOLDS.yellow) return "yellow";
  return "green";
}

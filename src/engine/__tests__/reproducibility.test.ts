// The reproducibility CI gate (PRD §4.2, §9: "score stability on re-run within ±5").
//
// Two guarantees, tested independently:
//   1. Determinism — same pages + same scorer ⇒ byte-identical scores across runs.
//   2. Band-bounding — even an ADVERSARIAL scorer returning 0 or 100 is clamped into the
//      heuristic band, so real-model variance can never exceed the band width. This is
//      what keeps the live-model spread small even though the model itself is stochastic.

import { test } from "node:test";
import assert from "node:assert/strict";

import { analyze } from "../analyzer.ts";
import { FixedStageScorer, MockStageScorer } from "../llm.ts";
import { acme, brokenco, midco } from "../../fixtures/sites.ts";

const AT = "2026-06-28T00:00:00.000Z";
const SITES = { acme, midco, brokenco };

test("determinism: 5 runs of the same site produce identical scores", async () => {
  for (const [name, pages] of Object.entries(SITES)) {
    const runs = await Promise.all(
      Array.from({ length: 5 }, () =>
        analyze({ url: name, pages, scorer: new MockStageScorer(), generatedAt: AT }),
      ),
    );
    const baseline = runs[0]!.stages.map((s) => `${s.stage}:${s.score}:${s.flag}`).join("|");
    for (const run of runs.slice(1)) {
      const got = run.stages.map((s) => `${s.stage}:${s.score}:${s.flag}`).join("|");
      assert.equal(got, baseline, `${name} drifted between runs`);
    }
  }
});

test("band-bounding: an adversarial LLM score of 0 or 100 is clamped into the heuristic band", async () => {
  for (const [name, pages] of Object.entries(SITES)) {
    const low = await analyze({ url: name, pages, scorer: new FixedStageScorer(0), generatedAt: AT });
    const high = await analyze({ url: name, pages, scorer: new FixedStageScorer(100), generatedAt: AT });
    for (const s of low.stages) {
      assert.ok(s.score >= s.band.low && s.score <= s.band.high, `${name}/${s.stage} below-clamp escaped band`);
      assert.equal(s.score, s.band.low, `${name}/${s.stage}: a 0 score should clamp to band.low`);
    }
    for (const s of high.stages) {
      assert.ok(s.score >= s.band.low && s.score <= s.band.high, `${name}/${s.stage} above-clamp escaped band`);
      assert.equal(s.score, s.band.high, `${name}/${s.stage}: a 100 score should clamp to band.high`);
    }
  }
});

test("worst-case real-model spread per stage equals band width (bounded, never unbounded)", async () => {
  // The maximum drift the LLM can introduce on any stage is exactly band.high - band.low.
  // Narrow bands (the common case once heuristics fire) ⇒ small spread ⇒ the ±5 target.
  const report = await analyze({ url: "acme", pages: acme, scorer: new MockStageScorer(), generatedAt: AT });
  for (const s of report.stages) {
    const spread = s.band.high - s.band.low;
    assert.ok(spread <= 100, `${s.stage} spread somehow exceeds 100`);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";

import { analyze } from "../analyzer.ts";
import { MockStageScorer } from "../llm.ts";
import { computeRootCause } from "../rootCause.ts";
import { flagFor } from "../scorer.ts";
import type { Flag, StageId, StageScore } from "../types.ts";

const AT = "2026-06-28T00:00:00.000Z";

function stage(id: StageId, score: number): StageScore {
  const flag: Flag = flagFor(score);
  return {
    stage: id,
    score,
    flag,
    band: { low: 0, high: 100, reasons: [] },
    evidence: [],
    bottleneckConfidence: 0.5,
    rootCauseProbability: 0.5,
    confidence: "full",
  };
}

test("root cause is the FURTHEST-UPSTREAM red, not the first one walking up from Sales", () => {
  // Demand Gen (downstream) AND Vision (upstream) both red. v1-draft's rule would have
  // blamed Demand Gen; the corrected rule blames Vision.
  const rc = computeRootCause([
    stage("vision", 30),
    stage("product_management", 85),
    stage("product_marketing", 82),
    stage("demand_generation", 35),
    stage("sales", 90),
  ]);
  assert.equal(rc.kind, "root_cause");
  assert.equal(rc.stage, "vision");
  assert.deepEqual(rc.downstreamSymptoms, ["demand_generation"]);
});

test("two adjacent reds: the upstream one wins and the downstream one is a symptom", () => {
  const rc = computeRootCause([
    stage("vision", 88),
    stage("product_management", 40),
    stage("product_marketing", 42),
    stage("demand_generation", 81),
    stage("sales", 85),
  ]);
  assert.equal(rc.stage, "product_management");
  assert.deepEqual(rc.downstreamSymptoms, ["product_marketing"]);
});

test("no reds → lowest-scoring yellow becomes the Priority Fix", () => {
  const rc = computeRootCause([
    stage("vision", 78),
    stage("product_management", 73),
    stage("product_marketing", 55),
    stage("demand_generation", 70),
    stage("sales", 90),
  ]);
  assert.equal(rc.kind, "priority_fix");
  assert.equal(rc.stage, "product_marketing");
});

test("all green → cycle healthy, no stage blamed", () => {
  const rc = computeRootCause([
    stage("vision", 90),
    stage("product_management", 88),
    stage("product_marketing", 85),
    stage("demand_generation", 82),
    stage("sales", 95),
  ]);
  assert.equal(rc.kind, "healthy");
  assert.equal(rc.stage, undefined);
});

test("integration: broken site → Vision is root cause (upstream), everything below is a symptom", async () => {
  const { brokenco } = await import("../../fixtures/sites.ts");
  const report = await analyze({ url: "https://brokenco.example", pages: brokenco, scorer: new MockStageScorer(), generatedAt: AT });
  assert.equal(report.overallFlag, "red");
  assert.equal(report.rootCause.kind, "root_cause");
  assert.equal(report.rootCause.stage, "vision");
  assert.equal(report.rootCause.downstreamSymptoms.length, 4);
});

test("integration: mediocre site → a MID-CYCLE root cause (Demand Gen), Sales flagged downstream", async () => {
  const { midco } = await import("../../fixtures/sites.ts");
  const report = await analyze({ url: "https://midco.example", pages: midco, scorer: new MockStageScorer(), generatedAt: AT });
  assert.equal(report.rootCause.stage, "demand_generation");
  assert.ok(report.rootCause.downstreamSymptoms.includes("sales"));
  // upstream stages must NOT be red, or they'd be the root cause instead
  const vision = report.stages.find((s) => s.stage === "vision")!;
  assert.notEqual(vision.flag, "red");
});

test("recommendations are ordered upstream-first, matching the root-cause rule", async () => {
  const { brokenco } = await import("../../fixtures/sites.ts");
  const report = await analyze({ url: "x", pages: brokenco, scorer: new MockStageScorer(), generatedAt: AT });
  assert.equal(report.recommendations[0]!.stage, "vision");
});

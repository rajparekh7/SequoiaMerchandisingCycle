import { test } from "node:test";
import assert from "node:assert/strict";

import { bandFor } from "../heuristics.ts";
import { STAGES } from "../types.ts";
import { acme, brokenco, midco } from "../../fixtures/sites.ts";

test("no pricing page hard-caps Sales at 50", () => {
  assert.equal(bandFor("sales", brokenco).high, 50);
});

test("transparent pricing + self-serve floors Sales at 60", () => {
  const band = bandFor("sales", acme);
  assert.equal(band.low, 60);
  assert.equal(band.high, 100);
});

test("zero blog posts caps Demand Generation at 40", () => {
  assert.equal(bandFor("demand_generation", midco).high, 40);
});

test("missing About caps Vision at 45; explicit ICP floors it at 55", () => {
  assert.equal(bandFor("vision", brokenco).high, 45);
  assert.equal(bandFor("vision", acme).low, 55);
});

test("inconsistent product noun + long H1 + no case studies caps Product Marketing", () => {
  const band = bandFor("product_marketing", brokenco);
  assert.ok(band.high <= 70, `expected high <= 70, got ${band.high}`);
  assert.ok(
    band.reasons.some((r) => /different ways/i.test(r)),
    "expected an inconsistent-noun reason",
  );
});

test("a cap always beats a floor — low is never above high, for every stage & fixture", () => {
  for (const site of [acme, midco, brokenco]) {
    for (const meta of STAGES) {
      const band = bandFor(meta.id, site);
      assert.ok(
        band.low <= band.high,
        `${meta.id}: low ${band.low} > high ${band.high}`,
      );
      assert.ok(band.low >= 0 && band.high <= 100, `${meta.id}: band out of 0–100`);
    }
  }
});

// Structural heuristics → deterministic score BANDS (PRD §4.2, §11 Q6).
//
// This is the load-bearing reproducibility mechanism. These caps/floors are pure code
// and identical on every run. The LLM layer can only place a score WITHIN the band a
// stage's heuristics produce here — it can never push Sales to 80 when there's no
// pricing page. Calibration of the exact thresholds is a pre-launch task (PRD §11 Q6).

import type { CrawledPage, PageType, ScoreBand, StageId } from "./types.ts";

function pagesOfType(pages: CrawledPage[], type: PageType): CrawledPage[] {
  return pages.filter((p) => p.type === type);
}

function wordCount(p: CrawledPage): number {
  return p.wordCount ?? p.markdown.trim().split(/\s+/).filter(Boolean).length;
}

function anyMatch(pages: CrawledPage[], re: RegExp): boolean {
  return pages.some((p) => re.test(p.markdown));
}

/** First-level markdown heading text of the homepage, if any. */
export function extractH1(pages: CrawledPage[]): string | null {
  const home = pagesOfType(pages, "homepage")[0] ?? pages[0];
  if (!home) return null;
  for (const line of home.markdown.split("\n")) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (m) return m[1] ?? null;
  }
  return null;
}

function clampBand(band: ScoreBand): ScoreBand {
  let { low, high } = band;
  low = Math.max(0, Math.min(100, low));
  high = Math.max(0, Math.min(100, high));
  if (low > high) low = high; // a cap always wins over a floor
  return { low, high, reasons: band.reasons };
}

type StageHeuristic = (pages: CrawledPage[]) => ScoreBand;

const vision: StageHeuristic = (pages) => {
  const reasons: string[] = [];
  let low = 0;
  let high = 100;
  const about = pagesOfType(pages, "about");
  if (about.length === 0) {
    high = Math.min(high, 45);
    reasons.push("No About/mission page found — Vision capped at 45.");
  } else {
    const thin = about.every((p) => wordCount(p) < 80);
    if (thin) {
      high = Math.min(high, 65);
      reasons.push("About page is thin (<80 words) — Vision capped at 65.");
    }
    if (anyMatch(about, /\b(built|designed|made)\s+for\b/i)) {
      low = Math.max(low, 55);
      reasons.push("Explicit ICP targeting language ('built for…') present.");
    }
  }
  return clampBand({ low, high, reasons });
};

const productManagement: StageHeuristic = (pages) => {
  const reasons: string[] = [];
  let low = 0;
  let high = 100;
  if (pagesOfType(pages, "docs").length === 0) {
    high = Math.min(high, 60);
    reasons.push("No docs/help center found — Product Management capped at 60.");
  }
  if (anyMatch(pages, /changelog|release notes|roadmap/i)) {
    low = Math.max(low, 45);
    reasons.push("Public changelog/roadmap signal present.");
  }
  if (anyMatch(pages, /integrations?\b/i)) {
    low = Math.max(low, 40);
    reasons.push("Integrations referenced.");
  }
  return clampBand({ low, high, reasons });
};

const productMarketing: StageHeuristic = (pages) => {
  const reasons: string[] = [];
  let low = 0;
  let high = 100;
  if (pagesOfType(pages, "case_study").length === 0) {
    high = Math.min(high, 70);
    reasons.push("No case studies found — Product Marketing capped at 70.");
  }
  const h1 = extractH1(pages);
  if (h1) {
    const words = h1.split(/\s+/).filter(Boolean).length;
    if (words > 10) {
      high = Math.min(high, 75);
      reasons.push(`Homepage H1 is ${words} words (>10) — Product Marketing capped at 75.`);
    }
  } else {
    high = Math.min(high, 70);
    reasons.push("No clear homepage H1 detected — Product Marketing capped at 70.");
  }
  // Messaging consistency: how many distinct nouns describe "the thing". Scan only CORE
  // marketing pages — a content-heavy blog naturally uses varied vocabulary and shouldn't
  // count as inconsistent positioning (this was firing false positives on large sites).
  const corePages = pages.filter(
    (p) => p.type === "homepage" || p.type === "product" || p.type === "case_study",
  );
  const nouns = ["platform", "solution", "tool", "software", "app"].filter((n) =>
    anyMatch(corePages, new RegExp(`\\b${n}\\b`, "i")),
  );
  if (nouns.length >= 3) {
    high = Math.min(high, 75);
    reasons.push(`Product described ${nouns.length} different ways (${nouns.join(", ")}) — inconsistent.`);
  }
  return clampBand({ low, high, reasons });
};

const demandGeneration: StageHeuristic = (pages) => {
  const reasons: string[] = [];
  let low = 0;
  let high = 100;
  const posts = pagesOfType(pages, "blog_post").length;
  if (posts === 0) {
    high = Math.min(high, 40);
    reasons.push("No blog posts found — Demand Generation capped at 40.");
  } else if (posts < 3) {
    high = Math.min(high, 65);
    reasons.push(`Only ${posts} blog post(s) — thin top-of-funnel, Demand Generation capped at 65.`);
  }
  if (anyMatch(pages, /whitepaper|\bebook\b|annual report|teardown|webinar|newsletter/i)) {
    low = Math.max(low, 45);
    reasons.push("Gated/lead-capture content present.");
  }
  return clampBand({ low, high, reasons });
};

const sales: StageHeuristic = (pages) => {
  const reasons: string[] = [];
  let low = 0;
  let high = 100;
  const pricing = pagesOfType(pages, "pricing");
  if (pricing.length === 0) {
    high = Math.min(high, 50);
    reasons.push("No pricing page found — Sales capped at 50 ('Contact Sales' is a wall, not a door).");
  } else {
    const hasNumbers = anyMatch(pricing, /\$\s?\d|\bper (month|user|seat|year)\b/i);
    const selfServe = anyMatch(pages, /start free|sign up|get started|free trial|try (it )?free/i);
    if (hasNumbers) {
      low = Math.max(low, 50);
      reasons.push("Transparent pricing with visible numbers.");
    } else {
      high = Math.min(high, 70);
      reasons.push("Pricing page exists but shows no prices — partial transparency, capped at 70.");
    }
    if (selfServe) {
      low = Math.max(low, 60);
      reasons.push("Self-serve start path present.");
    }
  }
  return clampBand({ low, high, reasons });
};

const HEURISTICS: Record<StageId, StageHeuristic> = {
  vision,
  product_management: productManagement,
  product_marketing: productMarketing,
  demand_generation: demandGeneration,
  sales,
};

export function bandFor(stage: StageId, pages: CrawledPage[]): ScoreBand {
  return HEURISTICS[stage](pages);
}

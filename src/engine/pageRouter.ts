// Page routing (PRD §6.2 / §6.3 cost fix). Each stage's LLM call sees ONLY the pages
// relevant to it — Sales scoring doesn't need blog posts. This is the corrected cost
// model: pages are routed, not broadcast to all five stages.

import type { CrawledPage, PageType, StageId } from "./types.ts";

const RELEVANT: Record<StageId, PageType[]> = {
  vision: ["homepage", "about", "case_study", "careers"],
  product_management: ["homepage", "product", "docs"],
  product_marketing: ["homepage", "product", "case_study"],
  demand_generation: ["homepage", "blog_index", "blog_post"],
  sales: ["homepage", "pricing", "product"],
};

export function routePages(stage: StageId, pages: CrawledPage[]): CrawledPage[] {
  const wanted = new Set<PageType>(RELEVANT[stage]);
  const routed = pages.filter((p) => wanted.has(p.type));
  // Always include the homepage as anchor context, even if a stage didn't list it.
  if (!routed.some((p) => p.type === "homepage")) {
    const home = pages.find((p) => p.type === "homepage");
    if (home) routed.unshift(home);
  }
  return routed;
}

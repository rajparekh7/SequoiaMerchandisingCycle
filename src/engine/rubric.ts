// Point-anchored rubrics (PRD §12). v1 deliberately replaces v1-draft's prose bands
// ("80–100: H1 is outcome-driven…") with fixed point contributions, so the same
// observation maps to the same points every run. These feed BOTH the LLM prompt
// (what to look for) and human-readable report copy.

import type { StageId } from "./types.ts";

export interface RubricCriterion {
  id: string;
  label: string;
  points: number; // contribution to the 0–100 stage score
}

/** Flag thresholds are shared across all stages. */
export const FLAG_THRESHOLDS = { red: 50, yellow: 80 } as const; // <50 red, <80 yellow, else green

export const RUBRICS: Record<StageId, RubricCriterion[]> = {
  vision: [
    { id: "icp_named", label: "About/mission names the exact ICP (role + segment)", points: 25 },
    { id: "economic_problem", label: "States the economic problem solved, not a generic mission", points: 20 },
    { id: "market_thesis", label: "Articulates a defensible market thesis / why-now", points: 20 },
    { id: "founder_credibility", label: "Founder/team expertise signals present", points: 15 },
    { id: "investor_logos", label: "Investor or customer-logo credibility", points: 20 },
  ],
  product_management: [
    { id: "features_depth", label: "Product/features page explains real capabilities", points: 25 },
    { id: "public_changelog", label: "Public changelog or roadmap", points: 20 },
    { id: "docs", label: "Docs / help center exists", points: 20 },
    { id: "integrations", label: "Integrations list present", points: 15 },
    { id: "reliability", label: "Reliability signals (SOC2, uptime, security page)", points: 20 },
  ],
  product_marketing: [
    { id: "h1_outcome", label: "H1 is outcome-driven and ≤10 words, no jargon", points: 20 },
    { id: "three_word_test", label: "Value prop passes the 3-word / 20-second test", points: 20 },
    { id: "consistency", label: "Consistent product noun across pages (one word for the thing)", points: 20 },
    { id: "case_studies", label: "≥2 case studies naming the ICP and a concrete ROI", points: 20 },
    { id: "vertical_positioning", label: "Clear vertical/segment positioning", points: 20 },
  ],
  demand_generation: [
    { id: "blog_cadence", label: "Blog with real cadence (≥3 substantive posts)", points: 25 },
    { id: "gated_content", label: "Gated asset (report, teardown, ebook) to capture leads", points: 25 },
    { id: "newsletter_webinar", label: "Newsletter or webinar CTA", points: 15 },
    { id: "seo_metadata", label: "SEO metadata / titles present and intentional", points: 15 },
    { id: "social_proof", label: "Volume of social proof (testimonials, press, ratings)", points: 20 },
  ],
  sales: [
    { id: "transparent_pricing", label: "Transparent, self-serve pricing on-site", points: 30 },
    { id: "plan_tiers", label: "Clear plan tiers a buyer can self-qualify against", points: 20 },
    { id: "self_serve_path", label: "Self-serve start path (sign up / free trial)", points: 25 },
    { id: "low_friction_contact", label: "Low-friction contact (Calendly/chat), not a wall", points: 15 },
    { id: "sales_transparency", label: "Sales motion is transparent (what happens after 'contact us')", points: 10 },
  ],
};

export function maxRubricPoints(stage: StageId): number {
  return RUBRICS[stage].reduce((sum, c) => sum + c.points, 0);
}

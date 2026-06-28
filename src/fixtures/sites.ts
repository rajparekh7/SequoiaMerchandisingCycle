// Three fixture sites used by the demo and the reproducibility/root-cause tests, and
// (per PRD §11 Q5) the seed for the landing-page live demo. Each is shaped to exercise a
// different branch of the diagnosis:
//   - acme   → no critical gaps → "priority fix" path
//   - midco  → a MID-CYCLE red (Demand Gen) with Sales as a downstream symptom
//   - brokenco → an UPSTREAM red (Vision) poisoning everything below it

import type { CrawledPage } from "../engine/types.ts";

/** A strong site: transparent pricing + self-serve, real content, consistent story. */
export const acme: CrawledPage[] = [
  {
    url: "https://acme.example/",
    type: "homepage",
    markdown:
      "# Close deals faster\n\nAcme is the revenue platform that turns pipeline into closed-won. " +
      "One platform, one source of truth for your whole go-to-market motion.",
  },
  {
    url: "https://acme.example/about",
    type: "about",
    markdown:
      "## About Acme\n\nAcme is built for revenue teams at Series B and later B2B software companies. " +
      "We exist to remove the single biggest tax on growth: the gap between what marketing generates " +
      "and what sales can actually act on. Our founders ran revenue operations at two public software " +
      "companies and watched millions in pipeline leak through that gap every quarter. Acme closes it by " +
      "giving every rep a live, prioritized view of the accounts most likely to convert this quarter, " +
      "backed by the same signals the best operators use. Backed by Sequoia and Benchmark.",
  },
  {
    url: "https://acme.example/pricing",
    type: "pricing",
    markdown:
      "## Pricing\n\nStarter — $49 per month per seat. Growth — $99 per month per seat. " +
      "Enterprise — custom. Start free, no credit card required.",
  },
  {
    url: "https://acme.example/product",
    type: "product",
    markdown: "## Product\n\nThe Acme platform covers scoring, routing, and forecasting. 40+ integrations.",
  },
  {
    url: "https://acme.example/docs",
    type: "docs",
    markdown: "## Docs\n\nGet started, API reference, integrations, and a public changelog. SOC 2 Type II.",
  },
  {
    url: "https://acme.example/customers/northwind",
    type: "case_study",
    markdown: "## Northwind cut sales cycle 32%\n\nNorthwind, a mid-market revenue team, closed 32% faster with the platform.",
  },
  {
    url: "https://acme.example/customers/globex",
    type: "case_study",
    markdown: "## Globex grew win rate 18%\n\nGlobex, an enterprise revenue team, lifted win rate 18% in two quarters.",
  },
  { url: "https://acme.example/blog", type: "blog_index", markdown: "## Blog\n\nDownload our annual report: the State of Revenue." },
  { url: "https://acme.example/blog/a", type: "blog_post", markdown: "## Pipeline hygiene\n\nHow to keep pipeline clean." },
  { url: "https://acme.example/blog/b", type: "blog_post", markdown: "## Forecasting\n\nHow to forecast revenue." },
  { url: "https://acme.example/blog/c", type: "blog_post", markdown: "## Routing\n\nHow to route leads fast." },
];

/** Decent upstream, but the funnel is starved at Demand Gen — and Sales is opaque downstream. */
export const midco: CrawledPage[] = [
  {
    url: "https://midco.example/",
    type: "homepage",
    markdown: "# Ship support that scales\n\nMidco is the support platform built for fast-growing teams.",
  },
  {
    url: "https://midco.example/about",
    type: "about",
    markdown:
      "## About\n\nMidco is built for support leaders at high-growth B2B companies who are drowning in " +
      "ticket volume as they scale. We replace the spreadsheet-and-shared-inbox stage with a single " +
      "platform that routes, prioritizes, and measures every conversation, so support stops being the " +
      "team that blocks growth and starts being the team that compounds retention. Founded by two former " +
      "heads of support who lived this exact problem through hypergrowth.",
  },
  {
    url: "https://midco.example/product",
    type: "product",
    markdown: "## Product\n\nThe Midco platform handles routing, SLAs, and reporting. Integrations available.",
  },
  { url: "https://midco.example/docs", type: "docs", markdown: "## Docs\n\nSetup guide and API reference. Roadmap is public." },
  {
    url: "https://midco.example/customers/initech",
    type: "case_study",
    markdown: "## Initech cut response time 40%\n\nInitech, a support team, halved first-response time with the platform.",
  },
  {
    url: "https://midco.example/pricing",
    type: "pricing",
    markdown: "## Pricing\n\nTeam — $79 per month per seat. Business — $149 per month per seat. Contact sales for Enterprise.",
  },
  // No blog posts at all → Demand Generation is capped hard.
];

/** A broken site: no About, no pricing, no proof, no content. Vision is the root cause. */
export const brokenco: CrawledPage[] = [
  {
    url: "https://brokenco.example/",
    type: "homepage",
    markdown:
      "# The all-in-one AI-powered platform solution to supercharge your business with next-generation automation tooling\n\n" +
      "Brokenco is a revolutionary tool. Our software is the best solution. Try the app today.",
  },
  {
    url: "https://brokenco.example/features",
    type: "product",
    markdown: "## Features\n\nLots of features. Powerful and flexible.",
  },
  {
    url: "https://brokenco.example/contact",
    type: "other",
    markdown: "## Contact\n\nContact sales to learn more. Request a demo.",
  },
];

export const FIXTURES = { acme, midco, brokenco } as const;
export type FixtureName = keyof typeof FIXTURES;

// Crawl orchestration (PRD §4.1): pick ≤20 same-origin pages within 2 hops of the root,
// prioritized by the page types the diagnosis needs, scrape them, classify, and flag a
// partial crawl when anything is blocked or fails.
//
// The network-bound scraping lives behind the `PageFetcher` interface, so this whole
// orchestration is unit-testable offline with a mock — same pattern as the engine's
// StageScorer. FirecrawlFetcher (firecrawl.ts) is the production implementation.

import { classifyPage, typeFromUrl } from "./classifier.ts";
import type { CrawledPage, PageType } from "../engine/types.ts";

export interface ScrapedPage {
  url: string;
  markdown: string;
  title?: string;
}

export interface PageFetcher {
  /** Return candidate URLs discovered from the root (Firecrawl /map, a sitemap, etc.). */
  map(rootUrl: string): Promise<string[]>;
  /** Scrape one URL to clean markdown; return null if it fails or is blocked. */
  scrape(url: string): Promise<ScrapedPage | null>;
}

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
}

// Lower rank = scraped first / survives the page cap. The diagnosis leans hardest on
// homepage, pricing, and about, so they win ties.
const TYPE_RANK: Record<PageType, number> = {
  homepage: 0,
  pricing: 1,
  about: 2,
  product: 3,
  case_study: 4,
  docs: 5,
  blog_index: 6,
  blog_post: 7,
  careers: 8,
  other: 9,
};

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function depthFromRoot(rootUrl: string, url: string): number {
  try {
    const root = new URL(rootUrl).pathname.split("/").filter(Boolean).length;
    const here = new URL(url).pathname.split("/").filter(Boolean).length;
    return Math.max(0, here - root);
  } catch {
    return Infinity;
  }
}

function normalize(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    const p = u.pathname.replace(/\/+$/, "");
    u.pathname = p === "" ? "/" : p;
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Pure URL selection: same-origin, within depth, deduped, prioritized by type, capped.
 * The root is always included as the homepage (first), even if /map didn't return it.
 */
export function selectUrls(
  rootUrl: string,
  candidates: string[],
  opts: CrawlOptions = {},
): string[] {
  const maxPages = opts.maxPages ?? 20;
  const maxDepth = opts.maxDepth ?? 2;
  const root = normalize(rootUrl);

  const seen = new Set<string>([root]);
  const kept: string[] = [];
  for (const raw of candidates) {
    const url = normalize(raw);
    if (seen.has(url)) continue;
    if (!sameOrigin(url, root)) continue;
    if (depthFromRoot(root, url) > maxDepth) continue;
    seen.add(url);
    kept.push(url);
  }

  kept.sort((a, b) => TYPE_RANK[typeFromUrl(a, root)] - TYPE_RANK[typeFromUrl(b, root)]);
  // Homepage first, then the prioritized remainder, capped.
  return [root, ...kept].slice(0, maxPages);
}

export interface CrawlResult {
  pages: CrawledPage[];
  partialCrawl: boolean;
}

export async function crawlSite(args: {
  rootUrl: string;
  fetcher: PageFetcher;
  options?: CrawlOptions;
}): Promise<CrawlResult> {
  const { rootUrl, fetcher, options } = args;
  const root = normalize(rootUrl);

  let candidates: string[] = [];
  let mapFailed = false;
  try {
    candidates = await fetcher.map(root);
  } catch {
    mapFailed = true;
  }

  const urls = selectUrls(root, candidates, options);
  const scraped = await Promise.all(urls.map((u) => fetcher.scrape(u).catch(() => null)));

  const pages: CrawledPage[] = [];
  let failures = 0;
  for (let i = 0; i < urls.length; i++) {
    const s = scraped[i];
    if (!s) {
      failures++;
      continue;
    }
    pages.push({
      url: s.url,
      type: classifyPage({ url: s.url, rootUrl: root, markdown: s.markdown, title: s.title }),
      markdown: s.markdown,
    });
  }

  // Partial if the map failed, anything failed to scrape, or we never got the homepage.
  const partialCrawl = mapFailed || failures > 0 || !pages.some((p) => p.type === "homepage");
  return { pages, partialCrawl };
}

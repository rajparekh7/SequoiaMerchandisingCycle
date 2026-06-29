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
  /** Max simultaneous scrapes — bounded to stay under crawler rate limits (PRD §4.1). */
  concurrency?: number;
}

/** Run `fn` over `items` with at most `limit` in flight; results stay in input order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Lower rank = scraped first / survives the page cap. The diagnosis leans hardest on
// homepage, pricing, and about, so they win ties.
// Common high-value paths to probe directly in case /map misses them (see crawlSite).
// Kept to structural pages whose absence would otherwise wrongly red-flag a stage.
const COMMON_PATHS = ["pricing", "about", "company", "product", "customers", "docs"] as const;

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
 * Pull same-origin links out of a page's markdown (nav/footer/body), resolving relative
 * hrefs against the root. The homepage's own links are the most reliable way to discover a
 * site's real structural pages — far better than guessing paths, since /about may actually
 * live at /company/about or /why-ramp.
 */
export function extractLinks(markdown: string, rootUrl: string): string[] {
  const root = normalize(rootUrl);
  const out = new Set<string>();
  const targets: string[] = [];
  for (const m of markdown.matchAll(/\]\(\s*([^)\s]+)\s*\)/g)) targets.push(m[1]!); // markdown links
  for (const m of markdown.matchAll(/https?:\/\/[^\s)<>"'\]]+/g)) targets.push(m[0]); // bare URLs
  for (const t of targets) {
    try {
      const abs = normalize(new URL(t, root).toString());
      if (sameOrigin(abs, root)) out.add(abs);
    } catch {
      /* not a resolvable URL */
    }
  }
  return [...out];
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

  // Phase 1 — scrape the homepage first. Its nav/footer links are the most reliable way to
  // find the site's REAL structural pages (whatever paths they live at).
  const homeScrape = await fetcher.scrape(root).catch(() => null);
  const homeLinks = homeScrape ? extractLinks(homeScrape.markdown, root) : [];

  // Phase 2 — discover candidates from /map (best-effort) + homepage links + common-path
  // probes. /map often misses structural pages on JS sites; homepage links + probes recover
  // them so a missing page isn't silently scored as ABSENT (false "red" stages).
  let mapCandidates: string[] = [];
  let mapFailed = false;
  try {
    mapCandidates = await fetcher.map(root);
  } catch {
    mapFailed = true;
  }
  const probes = COMMON_PATHS.map((p) => normalize(new URL(`/${p}`, root).toString()));
  // "Discovered" = real signals (map + homepage links). A discovered essential page that
  // fails to scrape lowers confidence; a speculative probe that 404s does not.
  const discovered = new Set<string>([...mapCandidates.map(normalize), ...homeLinks]);

  const urls = selectUrls(root, [...discovered, ...probes], options).filter((u) => u !== root);
  const scraped = await mapLimit(urls, options?.concurrency ?? 5, (u) =>
    fetcher.scrape(u).catch(() => null),
  );

  const ESSENTIAL: ReadonlySet<PageType> = new Set(["homepage", "pricing", "about", "product"]);
  const pages: CrawledPage[] = [];
  if (homeScrape) {
    pages.push({
      url: homeScrape.url,
      type: classifyPage({ url: homeScrape.url, rootUrl: root, markdown: homeScrape.markdown, title: homeScrape.title }),
      markdown: homeScrape.markdown,
    });
  }
  let essentialFailure = false;
  for (let i = 0; i < urls.length; i++) {
    const s = scraped[i];
    if (!s) {
      const u = urls[i]!;
      if (discovered.has(u) && ESSENTIAL.has(typeFromUrl(u, root))) essentialFailure = true;
      continue;
    }
    pages.push({
      url: s.url,
      type: classifyPage({ url: s.url, rootUrl: root, markdown: s.markdown, title: s.title }),
      markdown: s.markdown,
    });
  }

  // Partial if the map failed, an essential discovered page failed, or we never got the homepage.
  const partialCrawl = mapFailed || essentialFailure || !pages.some((p) => p.type === "homepage");
  return { pages, partialCrawl };
}

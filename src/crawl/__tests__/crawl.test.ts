import { test } from "node:test";
import assert from "node:assert/strict";

import { crawlSite, selectUrls } from "../crawl.ts";
import type { PageFetcher, ScrapedPage } from "../crawl.ts";

const ROOT = "https://x.com/";

test("selectUrls drops cross-origin and too-deep pages, dedupes, and leads with the homepage", () => {
  const out = selectUrls(ROOT, [
    "https://x.com/pricing",
    "https://x.com/pricing/", // dup of above after normalization
    "https://y.com/steal", // cross-origin
    "https://x.com/a/b/c", // depth 3 > maxDepth 2
    "https://x.com/blog/post-1", // depth 2 ok
  ]);
  assert.equal(out[0], "https://x.com/", "homepage must be first");
  assert.ok(out.includes("https://x.com/pricing"));
  assert.ok(out.includes("https://x.com/blog/post-1"));
  assert.ok(!out.some((u) => u.includes("y.com")), "cross-origin excluded");
  assert.ok(!out.some((u) => u.includes("/a/b/c")), "too-deep excluded");
  assert.equal(new Set(out).size, out.length, "no duplicates");
});

test("selectUrls prioritizes high-value page types and caps the count", () => {
  const candidates = [
    "https://x.com/blog/p1",
    "https://x.com/careers",
    "https://x.com/pricing",
    "https://x.com/about",
  ];
  const out = selectUrls(ROOT, candidates, { maxPages: 3 });
  assert.equal(out.length, 3);
  // homepage, then pricing & about win over blog/careers
  assert.deepEqual(out, ["https://x.com/", "https://x.com/pricing", "https://x.com/about"]);
});

class MockFetcher implements PageFetcher {
  pages: Record<string, string>;
  constructor(pages: Record<string, string>) {
    this.pages = pages;
  }
  async map(): Promise<string[]> {
    return Object.keys(this.pages).filter((u) => u !== ROOT);
  }
  async scrape(url: string): Promise<ScrapedPage | null> {
    const md = this.pages[url];
    return md === undefined ? null : { url, markdown: md };
  }
}

test("crawlSite scrapes, classifies, and reports a full crawl when everything succeeds", async () => {
  const fetcher = new MockFetcher({
    "https://x.com/": "# Home\nWelcome",
    "https://x.com/pricing": "## Pricing\n$10 per month",
    "https://x.com/about": "## About\nOur mission",
  });
  const { pages, partialCrawl } = await crawlSite({ rootUrl: ROOT, fetcher });
  assert.equal(partialCrawl, false);
  const types = pages.map((p) => p.type).sort();
  assert.deepEqual(types, ["about", "homepage", "pricing"]);
});

test("crawlSite flags a partial crawl when a page fails to scrape", async () => {
  const fetcher = new MockFetcher({
    "https://x.com/": "# Home",
    "https://x.com/pricing": "", // markdown "" → scrape returns null elsewhere; here force a miss
  });
  // Override scrape to fail the pricing page specifically.
  fetcher.scrape = async (url: string) =>
    url.endsWith("/pricing") ? null : { url, markdown: "# Home" };
  const { partialCrawl } = await crawlSite({ rootUrl: ROOT, fetcher });
  assert.equal(partialCrawl, true);
});

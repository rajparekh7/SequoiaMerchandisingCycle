import { test } from "node:test";
import assert from "node:assert/strict";

import { crawlSite, extractLinks, selectUrls } from "../crawl.ts";
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

test("extractLinks resolves relative links and keeps only same-origin", () => {
  const md =
    "[Pricing](/pricing) [About](https://x.com/company) [Twitter](https://twitter.com/acme) [Docs](docs)";
  const links = extractLinks(md, ROOT);
  assert.ok(links.includes("https://x.com/pricing"), "relative /pricing resolved");
  assert.ok(links.includes("https://x.com/company"), "absolute same-origin kept");
  assert.ok(links.includes("https://x.com/docs"), "bare-relative 'docs' resolved");
  assert.ok(!links.some((l) => l.includes("twitter.com")), "cross-origin excluded");
});

test("crawlSite discovers structural pages from homepage links (not just /map)", async () => {
  // /map is empty and the real about page is at a NON-standard path only linked from home.
  const fetcher: PageFetcher = {
    async map() {
      return [];
    },
    async scrape(url: string) {
      if (url === "https://x.com/") return { url, markdown: "# Home\n[Our story](/why-us)" };
      if (url === "https://x.com/why-us") return { url, markdown: "## About\nOur mission, built for teams" };
      return null;
    },
  };
  const { pages } = await crawlSite({ rootUrl: ROOT, fetcher });
  assert.ok(
    pages.some((p) => p.url === "https://x.com/why-us"),
    "non-standard about page discovered via homepage link",
  );
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

test("crawlSite flags a partial crawl when an ESSENTIAL page fails to scrape", async () => {
  const fetcher = new MockFetcher({
    "https://x.com/": "# Home",
    "https://x.com/pricing": "x",
  });
  // Fail the pricing page (essential) specifically.
  fetcher.scrape = async (url: string) =>
    url.endsWith("/pricing") ? null : { url, markdown: "# Home" };
  const { partialCrawl } = await crawlSite({ rootUrl: ROOT, fetcher });
  assert.equal(partialCrawl, true);
});

test("crawlSite probes common paths even when /map misses them", async () => {
  // map returns nothing, but /pricing exists — probing must still recover it, so the page
  // isn't wrongly scored as absent (the Ramp.com failure mode).
  const fetcher: PageFetcher = {
    async map() {
      return [];
    },
    async scrape(url: string) {
      if (url === "https://x.com/") return { url, markdown: "# Home" };
      if (url === "https://x.com/pricing") return { url, markdown: "## Pricing\n$10 per month" };
      return null;
    },
  };
  const { pages } = await crawlSite({ rootUrl: ROOT, fetcher });
  assert.ok(pages.some((p) => p.type === "pricing"), "pricing recovered via probe despite empty map");
});

test("a probe that 404s does not flag a partial crawl", async () => {
  const fetcher: PageFetcher = {
    async map() {
      return [];
    },
    async scrape(url: string) {
      return url === "https://x.com/" ? { url, markdown: "# Home" } : null;
    },
  };
  const { partialCrawl } = await crawlSite({ rootUrl: ROOT, fetcher });
  assert.equal(partialCrawl, false, "speculative probe misses shouldn't lower confidence");
});

test("crawlSite does NOT flag partial when only an OPTIONAL page fails", async () => {
  const fetcher = new MockFetcher({
    "https://x.com/": "# Home",
    "https://x.com/pricing": "## Pricing $10 per month",
    "https://x.com/blog/post-1": "## Post",
  });
  // Fail only the blog post (optional) — homepage + pricing still succeed.
  fetcher.scrape = async (url: string) =>
    url.includes("/blog/") ? null : { url, markdown: "# ok" };
  const { partialCrawl } = await crawlSite({ rootUrl: ROOT, fetcher });
  assert.equal(partialCrawl, false);
});

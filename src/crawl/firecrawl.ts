// Production PageFetcher backed by Firecrawl (PRD §6.1). Network-gated: constructing
// without an API key throws, so it's never hit by the offline tests (which use a mock
// PageFetcher). Map → candidate URLs; Scrape → clean markdown + title.
//
// Firecrawl endpoints can shift; if the response shape changes, this is the one place to
// adjust. The orchestration in crawl.ts is decoupled from it via the PageFetcher interface.

import type { PageFetcher, ScrapedPage } from "./crawl.ts";

const BASE = "https://api.firecrawl.dev/v1";

export class FirecrawlFetcher implements PageFetcher {
  readonly apiKey: string;
  constructor(apiKey: string) {
    if (!apiKey) throw new Error("FirecrawlFetcher requires an API key (set FIRECRAWL_API_KEY).");
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    return { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` };
  }

  async map(rootUrl: string): Promise<string[]> {
    const res = await fetch(`${BASE}/map`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ url: rootUrl, limit: 100 }),
    });
    if (!res.ok) throw new Error(`Firecrawl /map ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { links?: Array<string | { url: string }> };
    return (data.links ?? []).map((l) => (typeof l === "string" ? l : l.url));
  }

  async scrape(url: string): Promise<ScrapedPage | null> {
    const res = await fetch(`${BASE}/scrape`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!res.ok) return null; // blocked / 4xx / 5xx → treated as a scrape failure (partial crawl)
    const data = (await res.json()) as {
      data?: { markdown?: string; metadata?: { title?: string } };
    };
    const markdown = data.data?.markdown;
    if (!markdown) return null;
    return { url, markdown, title: data.data?.metadata?.title };
  }
}

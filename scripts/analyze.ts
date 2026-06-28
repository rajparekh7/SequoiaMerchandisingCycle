// Live end-to-end run: crawl a real URL with Firecrawl, score with Claude, print the report.
//   ANTHROPIC_API_KEY=... FIRECRAWL_API_KEY=... npm run analyze -- https://example.com
//
// This is the network-bound path (the offline demo is `npm run demo`). It's the same
// analyze() call the async job worker will make in the Next.js app — crawl → analyze → render.

import { analyze } from "../src/engine/analyzer.ts";
import { AnthropicStageScorer } from "../src/engine/llm.ts";
import { crawlSite } from "../src/crawl/crawl.ts";
import { FirecrawlFetcher } from "../src/crawl/firecrawl.ts";
import { formatReportText } from "../src/report/format.ts";

const url = process.argv[2];
if (!url) {
  console.error("Usage: npm run analyze -- <url>");
  process.exit(1);
}

const anthropicKey = process.env.ANTHROPIC_API_KEY;
const firecrawlKey = process.env.FIRECRAWL_API_KEY;
if (!anthropicKey || !firecrawlKey) {
  console.error("Set ANTHROPIC_API_KEY and FIRECRAWL_API_KEY (see .env.example).");
  process.exit(1);
}

console.error(`Crawling ${url} …`);
const { pages, partialCrawl } = await crawlSite({
  rootUrl: url,
  fetcher: new FirecrawlFetcher(firecrawlKey),
});
console.error(`Scored ${pages.length} pages (${pages.map((p) => p.type).join(", ")})${partialCrawl ? " — partial crawl" : ""}.`);

const report = await analyze({
  url,
  pages,
  scorer: new AnthropicStageScorer(anthropicKey),
  generatedAt: new Date().toISOString(),
  partialCrawl,
});

console.log("\n" + formatReportText(report));

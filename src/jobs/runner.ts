// The async job worker (PRD §6.2). Drives crawl → analyze and streams coarse progress into
// the job store, which the report page polls. Two modes:
//   - demo: fixture pages + deterministic MockStageScorer (no keys, for the live demo §11 Q5)
//   - live: Firecrawl crawl + Claude scoring (needs ANTHROPIC_API_KEY + FIRECRAWL_API_KEY)
//
// In V1 this runs in-process, kicked off (not awaited) by the POST route. Production moves
// it to a real queue/worker so it survives serverless function lifecycles.

import { crawlSite } from "../crawl/crawl.ts";
import { FirecrawlFetcher } from "../crawl/firecrawl.ts";
import { analyze } from "../engine/analyzer.ts";
import { AnthropicStageScorer, MockStageScorer } from "../engine/llm.ts";
import { FIXTURES } from "../fixtures/sites.ts";
import type { FixtureName } from "../fixtures/sites.ts";
import { updateJob } from "./store.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RunOpts {
  url: string;
  mode: "live" | "demo";
  demoName?: FixtureName;
}

export async function runJob(jobId: string, opts: RunOpts): Promise<void> {
  try {
    if (opts.mode === "demo") {
      const name: FixtureName = opts.demoName ?? "acme";
      const pages = FIXTURES[name];
      updateJob(jobId, { step: "Crawling site" });
      await sleep(500);
      updateJob(jobId, { step: "Routing pages" });
      await sleep(400);
      const report = await analyze({
        url: pages[0]!.url,
        pages,
        scorer: new MockStageScorer(),
        generatedAt: new Date().toISOString(),
        onProgress: (label) => updateJob(jobId, { step: label }),
      });
      updateJob(jobId, { step: "Generating recommendations" });
      await sleep(300);
      updateJob(jobId, { status: "done", step: "Done", report });
      return;
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!anthropicKey || !firecrawlKey) {
      updateJob(jobId, {
        status: "error",
        error: "Live analysis needs ANTHROPIC_API_KEY and FIRECRAWL_API_KEY. Try a sample report instead.",
      });
      return;
    }

    updateJob(jobId, { step: "Crawling site" });
    const { pages, partialCrawl } = await crawlSite({
      rootUrl: opts.url,
      fetcher: new FirecrawlFetcher(firecrawlKey),
    });
    if (pages.length === 0) {
      updateJob(jobId, { status: "error", error: "Could not crawl any pages from that URL." });
      return;
    }

    updateJob(jobId, { step: `Scoring ${pages.length} pages` });
    const report = await analyze({
      url: opts.url,
      pages,
      scorer: new AnthropicStageScorer(anthropicKey),
      generatedAt: new Date().toISOString(),
      partialCrawl,
      onProgress: (label) => updateJob(jobId, { step: label }),
    });
    updateJob(jobId, { status: "done", step: "Done", report });
  } catch (e) {
    updateJob(jobId, { status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

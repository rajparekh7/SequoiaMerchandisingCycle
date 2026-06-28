// The async job worker (PRD §6.2). Crawl → analyze, writing coarse progress milestones to
// the (KV-backed) job store that the report page polls. Two modes:
//   - demo: fixture pages + deterministic MockStageScorer (no keys; live-demo seeds §11 Q5)
//   - live: Firecrawl crawl + Claude scoring (needs ANTHROPIC_API_KEY + FIRECRAWL_API_KEY)
//
// Progress is written at sequential, awaited milestones (not via the engine's parallel
// per-stage onProgress hook) so concurrent read-modify-write updates can't clobber the
// final report in KV. On Vercel this runs inside `after()` so it survives the response.

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
      await updateJob(jobId, { step: "Crawling site" });
      await sleep(500);
      await updateJob(jobId, { step: "Scoring five stages" });
      await sleep(500);
      const report = await analyze({
        url: pages[0]!.url,
        pages,
        scorer: new MockStageScorer(),
        generatedAt: new Date().toISOString(),
      });
      await updateJob(jobId, { step: "Generating recommendations" });
      await sleep(300);
      await updateJob(jobId, { status: "done", step: "Done", report });
      return;
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!anthropicKey || !firecrawlKey) {
      await updateJob(jobId, {
        status: "error",
        error: "Live analysis needs ANTHROPIC_API_KEY and FIRECRAWL_API_KEY. Try a sample report instead.",
      });
      return;
    }

    await updateJob(jobId, { step: "Crawling site" });
    const { pages, partialCrawl } = await crawlSite({
      rootUrl: opts.url,
      fetcher: new FirecrawlFetcher(firecrawlKey),
    });
    if (pages.length === 0) {
      await updateJob(jobId, { status: "error", error: "Could not crawl any pages from that URL." });
      return;
    }

    await updateJob(jobId, { step: `Scoring ${pages.length} pages across five stages` });
    const report = await analyze({
      url: opts.url,
      pages,
      scorer: new AnthropicStageScorer(anthropicKey),
      generatedAt: new Date().toISOString(),
      partialCrawl,
    });
    await updateJob(jobId, { status: "done", step: "Done", report });
  } catch (e) {
    await updateJob(jobId, { status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

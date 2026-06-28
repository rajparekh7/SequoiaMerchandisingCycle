// The async job worker (PRD §6.2). Crawl → analyze, writing coarse progress milestones to
// the (KV-backed) job store that the report page polls. Two modes (from job.mode):
//   - demo: fixture pages + deterministic MockStageScorer (no keys; live-demo seeds §11 Q5)
//   - live: Firecrawl crawl + Claude scoring (needs ANTHROPIC_API_KEY + FIRECRAWL_API_KEY)
//
// The runner owns the job object and persists it wholesale at sequential milestones via
// saveJob — single SET per milestone, no read-modify-write. On Vercel this runs inside
// `after()` so it survives the response.

import { crawlSite } from "../crawl/crawl.ts";
import { FirecrawlFetcher } from "../crawl/firecrawl.ts";
import { analyze } from "../engine/analyzer.ts";
import { AnthropicStageScorer, MockStageScorer } from "../engine/llm.ts";
import { FIXTURES } from "../fixtures/sites.ts";
import type { FixtureName } from "../fixtures/sites.ts";
import { saveJob } from "./store.ts";
import type { Job } from "./store.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runJob(job: Job, demoName?: FixtureName): Promise<void> {
  try {
    if (job.mode === "demo") {
      const pages = FIXTURES[demoName ?? "acme"];
      job.step = "Crawling site";
      await saveJob(job);
      await sleep(500);
      job.step = "Scoring five stages";
      await saveJob(job);
      await sleep(500);
      const report = await analyze({
        url: pages[0]!.url,
        pages,
        scorer: new MockStageScorer(),
        generatedAt: new Date().toISOString(),
      });
      job.step = "Generating recommendations";
      await saveJob(job);
      await sleep(300);
      job.status = "done";
      job.step = "Done";
      job.report = report;
      await saveJob(job);
      return;
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!anthropicKey || !firecrawlKey) {
      job.status = "error";
      job.error = "Live analysis needs ANTHROPIC_API_KEY and FIRECRAWL_API_KEY. Try a sample report instead.";
      await saveJob(job);
      return;
    }

    job.step = "Crawling site";
    await saveJob(job);
    const { pages, partialCrawl } = await crawlSite({
      rootUrl: job.url,
      fetcher: new FirecrawlFetcher(firecrawlKey),
    });
    if (pages.length === 0) {
      job.status = "error";
      job.error = "Could not crawl any pages from that URL.";
      await saveJob(job);
      return;
    }

    job.step = `Scoring ${pages.length} pages across five stages`;
    await saveJob(job);
    const report = await analyze({
      url: job.url,
      pages,
      scorer: new AnthropicStageScorer(anthropicKey),
      generatedAt: new Date().toISOString(),
      partialCrawl,
    });
    job.status = "done";
    job.step = "Done";
    job.report = report;
    await saveJob(job);
  } catch (e) {
    job.status = "error";
    job.error = e instanceof Error ? e.message : String(e);
    await saveJob(job);
  }
}

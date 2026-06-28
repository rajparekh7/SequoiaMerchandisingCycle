# Sequoia Merchandising Cycle Analyzer

Drop a company URL, get a scored diagnostic against Doug Leone's Sequoia Merchandising
Cycle — which of the five stages (Vision → Product Management → Product Marketing →
Demand Generation → Sales) is the **probable root cause** of stalled growth, and the
prioritized fixes.

See [PRD.md](PRD.md) for the full product spec (v2).

## Status: Phase A — scoring engine + crawl layer

This repo currently contains the **engine** (deterministic scoring core) and the **crawl
layer** (URL discovery, page classification). Both are pure TypeScript with **zero
dependencies** for their logic — they run on Node 24's native type-stripping, so the tests
pass before you ever run `npm install`. Network-bound pieces (Firecrawl, Claude) sit behind
interfaces and are only used on a live run.

```bash
npm test        # 24 tests — heuristics, upstream-root-cause rule, reproducibility gate, classifier, crawl
npm run demo    # runs the engine on 3 fixture sites (great / mediocre / broken), no API key

# live run against a real URL (needs both keys — see .env.example):
ANTHROPIC_API_KEY=... FIRECRAWL_API_KEY=... npm run analyze -- https://example.com
```

> Requires Node ≥ 22 (developed on 24). No build step, no `tsc`, no network for the engine.

## What's here

```
src/engine/
  types.ts           Domain model. STAGES encodes upstream→downstream order (load-bearing).
  rubric.ts          Point-anchored rubrics per stage (PRD §12) — replaces v1's prose bands.
  heuristics.ts      Structural heuristics → deterministic score BANDS (PRD §4.2). The
                     reproducibility mechanism: e.g. "no pricing page → Sales ≤ 50".
  pageRouter.ts      Routes pages to relevant stages (PRD §6.3 cost fix — no broadcast).
  scorer.ts          Clamps the LLM score into the heuristic band; assigns the flag.
  rootCause.ts       THE v2 FIX (PRD §4.3): root cause = furthest-UPSTREAM red, not the
                     first red walking up from Sales. Downstream reds = symptoms.
  recommendations.ts Playbook, ordered upstream-first to match the root-cause rule.
  prompt.ts          Anthropic request + structured-output JSON schema; rubric is cached.
  llm.ts             StageScorer interface + MockStageScorer (tests) + AnthropicStageScorer.
  analyzer.ts        Orchestrator: band → routed pages → LLM-in-band → clamp → root cause.
  __tests__/         Heuristics, root-cause rule, and the reproducibility CI gate.
src/crawl/
  classifier.ts      URL/content → PageType. Pure, unit-tested (PRD §4.1).
  crawl.ts           selectUrls (origin/depth/cap guards) + crawlSite behind a PageFetcher.
  firecrawl.ts       Production PageFetcher (network-gated, needs FIRECRAWL_API_KEY).
  __tests__/         Classifier + crawl orchestration (offline, mock fetcher).
src/report/format.ts   Plain-text report renderer (reference for the HTML/PDF UI).
src/fixtures/sites.ts  Three demo sites (also the PRD §11 Q5 landing-page seeds).
scripts/demo.ts        Offline end-to-end demo.
scripts/analyze.ts     Live run: crawl a real URL → score → print.
```

## How the PRD v2 fixes show up in code

| PRD fix | Where |
|---|---|
| Upstream-root-cause rule (§4.3) | `rootCause.ts` — `computeRootCause` picks the lowest-`order` red |
| Score reproducibility (§4.2) | `heuristics.ts` (bands) + `scorer.ts` (clamp) + `prompt.ts` (structured output, no `temperature`) + `__tests__/reproducibility.test.ts` (CI gate) |
| Cost model — route, don't broadcast (§6.3) | `pageRouter.ts`, used by `analyzer.ts` |
| Model recommendation | `prompt.ts` — `DEFAULT_MODEL = "claude-opus-4-8"`; Haiku for extraction (§6.3) |

**On reproducibility & temperature:** `claude-opus-4-8` removes the `temperature`/`top_p`
sampling parameters, so we don't (can't) pin temperature. Stability instead comes from
(a) deterministic heuristic bands, (b) point-anchored rubrics, and (c) structured outputs.
The reproducibility test proves an adversarial model score of 0 or 100 is still clamped
inside the band — bounding worst-case live-model spread to the band width.

## Web app (Next.js)

The Next.js App Router frontend wraps the engine: a URL-input home page, an **async job**
API (`POST /api/analyze` returns a job id; the report page polls `GET /api/analyze/[id]`),
a live progress UI, and a report view with a print-to-PDF button.

```bash
npm run dev          # http://localhost:3000
# In the UI: click a sample report (no API key needed), or enter a real URL
# (live URLs need ANTHROPIC_API_KEY + FIRECRAWL_API_KEY in .env.local).
```

```
app/
  page.tsx                    URL input + "try a sample" buttons
  report/[id]/page.tsx        polls job status → progress bar → report view + Save-as-PDF
  api/analyze/route.ts        POST: enqueue job, return id
  api/analyze/[id]/route.ts   GET: job status + report
src/jobs/
  store.ts                    in-memory job store (V1 — swap for Supabase in prod)
  runner.ts                   the async worker: crawl → analyze, streams progress
```

> **Requires Next 16.** If `npm run build`/`dev` errors with `next.config.ts is not
> supported` or a `dist/next-server` path, an old Next got installed. Fix:
> `rm -rf node_modules package-lock.json && npm install` then verify `npm ls next` shows
> 16.x. (Some npm security wrappers — e.g. a `min-release-age` setting — can pin or rewrite
> versions; if `next` keeps reverting to an old major, check your `.npmrc`.)

The in-memory job store means share links are process-local in V1 (they die on restart) —
production persistence is the Supabase swap noted below.

## Deploy to Vercel

The app is serverless-ready: the job store uses **Vercel KV (Upstash Redis)** in production
(shared across function instances) and an in-memory fallback locally, and the background
worker runs via Next's `after()` so it survives the response.

1. **Import the repo.** Vercel → Add New → Project → import this GitHub repo. Next.js is
   auto-detected; deploy.
2. **Attach KV.** Vercel → Storage → Create → KV / Upstash Redis → connect to the project.
   This injects `KV_REST_API_URL` + `KV_REST_API_TOKEN` automatically. Redeploy.
   **Without KV the async flow won't work on serverless** (POST and the polling GET land on
   different instances) — sample reports would hang. KV is the one required add-on.
3. **(Live URLs only)** add `ANTHROPIC_API_KEY` + `FIRECRAWL_API_KEY` in Project Settings →
   Environment Variables. Sample reports need neither.

CLI alternative: `vercel` (link/first deploy) then `vercel --prod`.

> `maxDuration` is set to 300s on the analyze route via the in-code segment config (the
> Vercel-recommended method for App Router — no `vercel.json` needed). 300s is Hobby's max
> with fluid compute and safe on Pro/Enterprise. It covers the `after()` background work
> (crawl + 5 LLM calls); a dedicated queue/streaming pipeline is the V2 upgrade.

## Going live

Crawl and score are both decoupled from I/O behind interfaces (`PageFetcher`,
`StageScorer`), so a live run is just wiring the production implementations:

```ts
import { crawlSite } from "./src/crawl/crawl.ts";
import { FirecrawlFetcher } from "./src/crawl/firecrawl.ts";
import { analyze } from "./src/engine/analyzer.ts";
import { AnthropicStageScorer } from "./src/engine/llm.ts";

const { pages, partialCrawl } = await crawlSite({
  rootUrl: url,
  fetcher: new FirecrawlFetcher(process.env.FIRECRAWL_API_KEY!),
});
const report = await analyze({
  url,
  pages,
  scorer: new AnthropicStageScorer(process.env.ANTHROPIC_API_KEY!),
  generatedAt: new Date().toISOString(),   // engine takes no clock itself
  partialCrawl,
});
```

`scripts/analyze.ts` is exactly this. Remaining Phase A (per [PRD.md](PRD.md) §10): the
**async job queue + status streaming**, the **Next.js report UI + PDF export**, and
**free-tier auth + share links** (with the content-republishing policy from §5 enforced) —
these need `npm install` (Next.js etc.) and a registry the current sandbox can't reach,
so they run on your machine.

# PRD: Sequoia Merchandising Cycle Analyzer

> **Product:** A web app that ingests a company's website URL and produces a diagnostic report against the Sequoia Merchandising Cycle — identifying gaps, scoring coverage, and prescribing prioritized fixes.
> **Author:** Raj Parekh
> **Date:** June 28, 2026
> **Status:** Draft v2 — revised after architecture review

---

## Changelog (v1 → v2)

This revision patches four issues that would have shipped as bugs or broken promises:

1. **Bottleneck rule rewritten (§4.3).** v1's "first 🔴 walking up from Sales" found the most *downstream* broken stage, contradicting the product's own thesis ("the bottleneck is almost always upstream") and the recommendation panel's "fix Vision first" ordering. Root cause is now the **furthest-upstream 🔴**.
2. **Score reproducibility made a first-class requirement (§4.2, §6.3).** v1 never addressed run-to-run drift — the single biggest threat to the "accurate >4.0" success metric. v2 anchors scores deterministically and constrains the LLM to move *within* a heuristic-determined band, using structured outputs for guaranteed-parseable results. (Note: temperature pinning is **not** the mechanism — the recommended model removes sampling parameters; see §6.3.)
3. **Timing target made honest (§7.2, §9).** A 20-page JS crawl + 5 LLM passes will not reliably finish in <30s. The run is now **asynchronous** with a real progress stream; the median target is 30–60s.
4. **Cost model corrected (§6.3).** v1 implied resending every page to every stage. v2 routes pages to relevant stages and caches the rubric, cutting tokens and cost substantially.
5. **Legal/ToS exposure acknowledged (§5).** Scraping, caching, and republishing third-party site content on public links is a real risk; added as an explicit policy + non-goal.

---

## 1. Problem Statement

Founders and operators routinely misdiagnose stalled growth. The default instinct when revenue flattens is to blame sales or swap the VP. Doug Leone's Sequoia Merchandising Cycle proves the opposite: **the bottleneck is almost always upstream** (vision → product → marketing → demand gen), yet teams lack a structured way to audit it.

This app turns that framework into a **self-service diagnostic**. Drop a URL. Get a scored analysis of where the company is strong, where it is bleeding, and exactly what to fix first.

---

## 2. The Framework (In-App Logic)

The analyzer maps public signals from a website to the five stages of the cycle. The diagnostic **collects evidence backward** — Sales first, then upstream — because that is how you observe symptoms. But it **assigns root cause upstream** (see §4.3), because a broken upstream stage poisons everything below it.

| Stage | What the App Checks | Key Signals Scraped / Inferred |
|-------|---------------------|-------------------------------|
| **5. Sales** | Can a visitor buy easily? Is the sales motion transparent? | Pricing page clarity, self-serve vs. demo request, Calendly/chatbot presence, "Talk to Sales" prominence, plan tiers |
| **4. Demand Generation** | Is the company filling the funnel with the right leads? | Blog cadence & quality, gated content (whitepapers, reports), newsletter/webinar CTAs, SEO metadata, social proof volume, backlink activity |
| **3. Product Marketing** | Is the story crisp, unique, and consistent? | Homepage headline clarity (3-word test, 20-second test), messaging consistency across pages, case studies, vertical positioning, "Jobs-style" value prop |
| **2. Product Management** | Does the deliverable match the promise? | Product/features page depth, changelog/roadmap public, docs/help center, integrations list, supported use cases, reliability signals (SOC2, uptime) |
| **1. Vision** | Is the ICP and market thesis defensible? | About page / mission clarity, ICP specificity, market-size language, founder-expertise signals, investor/logo credibility |

**Scoring logic:** Each stage receives a coverage score (0–100) and a qualitative flag:
- 🔴 **Critical gap** — likely bottlenecking the whole cycle
- 🟡 **Weak link** — tolerable now, but will cap growth soon
- 🟢 **Solid** — not the problem; move downstream

---

## 3. Target Users & Use Cases

| User | Use Case | Frequency |
|------|----------|-----------|
| **SaaS Founder / CEO** | Pre-board-meeting sanity check: "Is it really a sales problem?" | Monthly or when growth stalls |
| **Product Marketer** | Competitive teardown: how does our merchandising compare to Competitor X? | Ad hoc / per campaign |
| **VC / Growth Advisor** | Rapid portfolio triage: which portfolio company has a vision gap vs. a demand-gen gap? | Weekly |
| **Consultant / Agency** | Client onboarding: baseline the full funnel before recommending spend | Per engagement |

---

## 4. Core Features

### 4.1 URL Input & Crawl
- Single URL entry (homepage). App spider-limits to **~20 pages** (homepage, pricing, about, product, blog index, 2–3 posts, case studies, docs, careers, etc.).
- Depth guard: max 2 hops from root.
- **Failure mode:** If robots.txt blocks or avg response >3s, surface a partial-read warning and score only accessible pages. A stage scored on incomplete evidence is flagged **"low confidence — partial crawl"** rather than scored as if complete.

### 4.2 Stage-by-Stage Scoring Engine

For each stage, the engine performs a **rubric-based evaluation** in two layers. **The deterministic layer leads; the LLM layer refines within bounds.** This ordering is what makes scores reproducible.

- **Structural heuristics (cheap, deterministic):** presence/absence of pricing page, word count on About, blog post count, CTA density, case-study count, etc. These compute a **score band** for each stage — e.g. *no pricing page anywhere → Sales is hard-capped at 50; no case studies → Product Marketing capped at 70.* These caps and floors are pure code and identical on every run.
- **LLM reasoning layer (qualitative):** evaluates message crispness, ICP clarity, 3-word test, vertical positioning, cross-page consistency — and places the score **within the band the heuristics already fixed.** It cannot push Sales to 80 if there's no pricing page; it decides whether a no-pricing-page site is a 30 or a 48.

**Reproducibility requirements (V1, not optional):**
- The LLM call uses **structured outputs** (a JSON schema via `output_config.format`) so every response is guaranteed-parseable — no free-text score extraction.
- The rubric uses **explicit point-valued anchors**, not prose bands (see §12), so the model maps observations to points the same way each time.
- Heuristic caps/floors clamp the final score, bounding any residual LLM variance to within a band.
- A regression test runs the same fixture sites repeatedly and asserts scores stay within a tolerance (target: ±5 points). This is a CI gate, not a manual check.

**Output per stage:**
- Score: 0–100
- Flag: 🔴 / 🟡 / 🟢
- Evidence: 2–4 bullet points of what was found (or missing)
- Bottleneck probability: % confidence this stage is the primary constraint
- Confidence: full / partial-crawl

### 4.3 Bottleneck Identification

The app applies the **Leone upstream-root-cause rule**:

1. **Collect symptoms backward** — score every stage from Sales (5) up to Vision (1).
2. **Assign root cause upstream** — the **Probable Root Cause** is the **furthest-upstream stage that is 🔴**. Rationale: a broken upstream stage (e.g. an undefined ICP) poisons every stage below it, so a downstream 🔴 that sits beneath an upstream 🔴 is treated as a *symptom*, not the cause. Fix the upstream one first.
   - *Worked example:* Demand Gen 🔴 and Vision 🔴 → **Vision is the root cause**; Demand Gen is flagged as a likely-downstream symptom that may resolve once Vision is fixed.
3. **If no 🔴 exists** — the lowest-scoring 🟡 (furthest upstream on ties) becomes the **Priority Fix**.
4. **If all 🟢** — return: *"The cycle is healthy publicly. If growth is still stalled, look at (a) internal ops / churn, or (b) the vision may be right but the market is smaller than assumed."*

The recommendation panel (§7.3) orders fixes by this same upstream-first dependency, so the root-cause rule and the rec ordering are now consistent.

### 4.4 Recommendation Engine
Per identified gap, the app generates **1 prioritized recommendation** drawn from a playbook:

| Stage | Typical Recommendation (Example) |
|-------|----------------------------------|
| Vision | "Sharpen your About page to name the exact ICP and the economic problem you solve. Remove generic mission language." |
| Product Mgmt | "Publish a public changelog and a use-case matrix so prospects can self-qualify." |
| Product Marketing | "Rewrite the homepage H1 to pass the 3-word test. Current headline is 27 words and describes a feature, not an outcome." |
| Demand Gen | "Add a gated teardown or annual report to convert blog readers into leads. BDRs cannot 10× if top-of-funnel stays flat." |
| Sales | "Add transparent self-serve pricing. 'Contact Sales' is a wall, not a door, for sub-$50k ACV buyers." |

**Format:** Each recommendation includes:
- The specific finding that triggered it
- 1–2 concrete changes (copy-pasteable where possible)
- Expected impact on the stage score if implemented
- Difficulty: Low / Medium / High

### 4.5 Report Export
- **In-app:** Rich HTML report with collapsible sections, score radars, and color coding.
- **PDF export:** Clean, board-ready PDF (1 page exec summary + appendices).
- **Shareable link:** Persistent URL for each report (no auth required to view, optional password). See §5 for the content-republishing policy that governs what these links may display.
- **Slack / Email share:** One-click send with summary + link.

### 4.6 Competitive Compare (V2)
- Side-by-side report of Company A vs. Company B.
- Delta scores per stage.
- "Where they win / where you win" summary.

### 4.7 History & Trends (V2)
- Re-run the same URL monthly; see stage scores over time.
- Alert when a previously 🟢 stage drops to 🟡 (e.g., blog went stale).

---

## 5. Non-Goals (Out of Scope for V1)

| Item | Rationale |
|------|-----------|
| Full-site SEO audit (technical SEO, Core Web Vitals) | Too broad; stay focused on merchandising-cycle coverage only |
| Real revenue / traffic data integration | Users don't grant GA/Stripe access easily; app runs on public signals only |
| Multi-language websites | English-only for V1; i18n heuristics are a different product |
| Social media / ad creative analysis | Out of scope; focus on owned web property |
| Real-time monitoring | V1 is on-demand analysis, not a watchdog |
| Fix-it-for-you execution | The app diagnoses and prescribes; implementation is on the user or a downstream agency integration (future) |
| Verbatim republishing of crawled third-party copy | See policy below |

**Content & ToS policy (V1):**
- Respect `robots.txt`; skip disallowed paths and note them in the partial-crawl warning.
- Raw crawled HTML/markdown is **derived-only** internally and **never reproduced verbatim** on public share links. Share links display our scores, flags, and *our own* evidence summaries — not the source site's copy. Short quoted snippets (e.g. an offending H1) are permitted as fair-use evidence; full-page reproduction is not.
- Raw page content is purged on a 30-day schedule (see §11 Q4); derived scores are retained.
- Competitive Compare (V2) carries the same constraint — it shows deltas and our analysis, not a side-by-side of competitors' copy.

---

## 6. Technical Architecture

### 6.1 Stack Recommendation

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Next.js 16 (App Router) + Tailwind + shadcn/ui | Raj's ROC default; fast, SEO-friendly, easy PDF export |
| Backend | Next.js API Routes + Vercel (with a queue for the async run) | Serverless, colocated; see §6.2 on async |
| Crawler | Firecrawl API (or self-hosted `crawlee` / `playwright` cluster) | Handles JS-rendered SPAs, returns clean markdown; free tier generous |
| Analysis Engine | **Claude** via the Anthropic API with structured outputs (`output_config.format`) | Qualitative judgment (3-word test, ICP crispness, messaging consistency) is reasoning-heavy, not extraction; structured outputs guarantee parsable scores. Model split in §6.3. |
| Auth & Accounts | NextAuth.js + GitHub/Google | Minimal friction; optional for share links |
| Reporting | `react-pdf` or server-side `puppeteer` → PDF | Board-ready static exports |
| Database | Supabase (PostgreSQL) | Free tier, vector support for V2, Raj's existing comfort. Also backs the job queue / status table for the async run. |
| Hosting | Vercel + Supabase | Raj's existing stack for ROC |

### 6.2 Data Flow (asynchronous)

The run is a **background job**, not a single request — a 20-page crawl plus 5 LLM passes exceeds a comfortable synchronous request budget on Vercel and would frequently blow the <30s target.

```
User enters URL
    → API enqueues a job, returns a job_id immediately
    → Client polls /status/{job_id} (or subscribes via SSE) and drives the progress UI

Worker:
    → Firecrawl scrapes ≤20 pages → returns {url, markdown, metadata}
    → Stage Router splits pages by type (homepage, pricing, about, blog, product, etc.)
    → Structural Heuristics compute per-stage score bands (deterministic)
    → Prompt Builder assembles per-stage prompts: cached rubric + ONLY the pages relevant to that stage + the heuristic band
    → LLM evaluates each stage (parallel, 5 calls, structured JSON output)
    → Scoring Engine clamps LLM scores to bands, applies upstream-root-cause rule (§4.3)
    → Recommendation Engine picks from playbook based on root-cause stage
    → Report Assembler → HTML + optional PDF
    → Persist to DB → mark job complete → generate share link
```

### 6.3 LLM Prompt & Model Design

**Model split (cost/quality optimized):**
- **Structural extraction / cheap classification** (does a pricing page exist, count blog posts, extract the H1): `claude-haiku-4-5` ($1 / $5 per 1M in/out) — fast and cheap, or pure code where deterministic parsing suffices.
- **Qualitative stage scoring** (the 5 rubric evaluations): `claude-opus-4-8` ($5 / $25 per 1M) for the judgment quality the framework depends on. `claude-sonnet-4-6` ($3 / $15) is the cost-down option if A/B testing shows acceptable agreement.

**Reproducibility note — temperature is not the lever.** Claude Opus 4.8 / 4.7 (and Fable 5) **remove the `temperature` / `top_p` / `top_k` sampling parameters** — passing them returns a 400. Reproducibility therefore comes from (a) the deterministic heuristic bands, (b) point-valued rubric anchors, and (c) structured outputs — not from pinning temperature. If a model that still accepts `temperature` is chosen for a sub-task (e.g. Haiku), pin it low there, but the architecture must not depend on it.

**Prompt caching:** the rubric + system prompt is identical across all 5 stage calls and across every report, so it goes behind a `cache_control` breakpoint. Cache reads bill at ~0.1× input, turning the rubric from a per-call cost into a near-free prefix.

**Structured outputs:** each stage call sets `output_config.format` to a JSON schema (see §12), so the response is validated to the exact `{score, flag, evidence[], bottleneck_confidence, root_cause_probability}` shape — no regex/string parsing of model output.

Each stage prompt is **system prompt + rubric (cached) + heuristic band + only the pages relevant to that stage**. Example system framing for Product Marketing:

> **System:** You are an expert product marketer evaluating a B2B SaaS website against Doug Leone's merchandising cycle. The structural heuristics have determined this stage's score must fall between {band_low} and {band_high}. Place the score within that band and justify it. Return JSON matching the provided schema (keys: score, flag, evidence, bottleneck_confidence, root_cause_probability).
>
> **Rubric (point-anchored — see §12):** e.g. H1 outcome-driven & ≤10 words = +20; messaging consistent across all pages = +20; ≥2 case studies naming ICP + ROI = +20; …

**Cost estimate (corrected):** Pages are routed to relevant stages, not broadcast to all five. Cleaned markdown for ~20 pages ≈ 25–35K tokens total; each stage sees only its ~3–6 relevant pages. With the rubric cached and Opus 4.8 for the 5 qualitative calls, expect **~$0.10–0.20 per report** (input-dominated; cached rubric reads at 0.1×). Using Haiku/code for extraction and Sonnet for some stages drops this further. Re-runs that reuse cached page content are cheaper still. (v1's "100K tokens / $0.25" assumed every page hit every stage — that's the inflated path this design avoids.)

---

## 7. UI/UX Spec (V1)

### 7.1 Home / Input
- Hero: "Diagnose why growth stalled — before you fire the sales team."
- Single input: URL + "Analyze" CTA.
- Below the fold: one-sentence explanation of each stage with hover tooltip.

### 7.2 Loading State (real async progress)
- The progress bar reflects **actual job state** streamed from the worker, not a fake timer: "Crawling site → Routing pages → Scoring Vision → Product → Marketing → Demand → Sales → Generating recommendations."
- Estimated time: **30–60 seconds** (median target; see §9). The async design means the user can leave and return to a share link if it runs long, and a slow crawl degrades gracefully to a partial report rather than a timeout.

### 7.3 Report Page
- **Executive Summary (top):**
  - Overall cycle health: 🔴 / 🟡 / 🟢
  - Probable Root Cause stage highlighted (furthest-upstream 🔴 per §4.3)
  - 1-sentence bottom-line ("Your vision is undefined, which is starving demand gen downstream. Sales is not the problem.")
- **Stage Cards (5 collapsible sections):**
  - Gauge chart (0–100)
  - Flag + evidence bullets + confidence badge
  - If this stage is the root cause: the recommendation card is expanded by default
  - Downstream stages identified as likely-symptoms are visually linked to the root cause
- **Recommendation Panel (right rail on desktop, stacked on mobile):**
  - Prioritized list ranked by upstream dependency (fix Vision first, etc.) — consistent with §4.3
  - Each rec: finding + action + difficulty
- **Actions bar:** Export PDF, Copy link, Re-run analysis.

### 7.4 Report List / Dashboard (logged-in users)
- Table of past analyses: URL, date, root-cause stage, overall score trend.
- Upgrade CTA (V2 features) if free-tier limit reached.

---

## 8. Monetization & Tiers

| Tier | Price | Limits | Features |
|------|-------|--------|----------|
| **Free** | $0 | 3 reports / month, 1 user, no history | Full V1 analysis, PDF export, share link |
| **Pro** | $29/mo or $290/yr | Unlimited reports, 3 users, 12-mo history | Competitive compare, trend charts, API access |
| **Team** | $99/mo | Unlimited, 10 users, brand-white-label PDFs | Team workspace, Slack integration, CSV bulk export |

**Enterprise:** Custom for agencies / VC firms who want bulk URL uploads and custom rubrics.

---

## 9. Success Metrics (V1)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Report completion rate | >70% | % of URL submits that produce a full report |
| Time to report (median) | **<60s** | Server-side timing on the async job (revised from <30s — the original was not achievable for a 20-page JS crawl + 5 LLM passes) |
| Score stability on re-run | **within ±5 points** | Automated regression on fixture sites (CI gate — see §4.2) |
| User-reported "accurate" rating | >4.0 / 5 | In-app thumbs-up/down on the root-cause diagnosis |
| Free → Pro conversion | >5% | Stripe event tracking |
| Report share rate | >20% | % of reports that generate a shared link |

---

## 10. Roadmap

### Phase A — MVP (Weeks 1–4)
- [ ] Firecrawl integration + page router
- [ ] Structural heuristics layer (score bands) + unit tests
- [ ] 5-stage Claude prompt suite with structured outputs + JSON schema validation
- [ ] Async job queue + status/progress streaming
- [ ] Upstream-root-cause rule + score reproducibility regression test (CI gate)
- [ ] Report UI (Next.js, radar chart, collapsible cards)
- [ ] PDF export
- [ ] Free-tier auth + share links (with content-republishing policy enforced)
- [ ] Landing page with live demo (pre-seeded examples: ServiceNow, a mediocre SaaS, a broken one)

### Phase B — Polish & Conversion (Weeks 5–8)
- [ ] Pro tier + Stripe billing
- [ ] Competitive compare (2 URLs)
- [ ] Report history + trend graphs
- [ ] Caching layer (page content + scores; respects 30-day raw-content purge)

### Phase C — Distribution & Scale (Months 3–6)
- [ ] Public API (submit URL → receive webhook with report)
- [ ] Slack app (/merchandise [url])
- [ ] Agency/VC bulk-upload (CSV of URLs)
- [ ] Self-serve Chrome extension (analyze current tab)

---

## 11. Open Questions / Decisions Needed

1. **Crawler vendor:** Firecrawl (managed, $$$) vs. self-hosted Crawlee + Playwright (cheaper, more ops)? Firecrawl recommended for V1 speed.
2. **LLM model:** *(updated)* Recommend `claude-opus-4-8` for the 5 qualitative stage scores, `claude-haiku-4-5`/code for extraction. A/B `claude-sonnet-4-6` against Opus to see if the cheaper tier holds score agreement before committing.
3. **Report persistence:** Are share links truly public (no auth), or require email-gate to view? Public lowers friction; gated improves lead-gen. (Either way, share links show our analysis only, not republished source copy — §5.)
4. **Data retention:** 30-day purge of raw HTML/markdown, keep derived scores indefinitely. Confirm this satisfies the content policy in §5.
5. **Demo strategy:** Pre-seed 3 reports (great / mediocre / bad) so visitors can see output without entering a URL. This is likely the highest-conversion feature.
6. **Heuristic band tuning:** The caps/floors in §4.2 (e.g. "no pricing page → Sales ≤50") are the load-bearing reproducibility mechanism. Need a calibration pass against ~20 known sites to set them before launch.

---

## 12. Appendix: Rubric Detail (V1 Prompt Spec)

Each stage call uses **structured outputs** (`output_config.format` with this JSON schema), so the model's response is validated to this exact shape — no free-text parsing:

```json
{
  "stage": "product_marketing",
  "score": 42,
  "flag": "red",
  "evidence": [
    "Homepage headline is 18 words and describes a feature, not an outcome.",
    "No case studies present on the site.",
    "Messaging shifts between 'platform', 'solution', and 'tool' across pages."
  ],
  "bottleneck_confidence": 0.85,
  "root_cause_probability": 0.72,
  "confidence": "full"
}
```

**Point-anchored rubric (replaces v1's prose bands).** Prose bands like "80–100: H1 is outcome-driven…" invited drift because the model had to holistically guess a band. Point anchors map each observation to a fixed contribution, so the same site scores the same way. Example for Product Marketing (heuristic band clamps the final total):

| Criterion (observed in evidence) | Points |
|---|---|
| H1 is outcome-driven and ≤10 words, no jargon | +20 |
| Value prop passes the 3-word / 20-second test | +20 |
| Messaging consistent across all pages (one noun for the product) | +20 |
| ≥2 case studies that name the ICP and a concrete ROI | +20 |
| Clear vertical/segment positioning | +20 |

Flag thresholds: 🔴 0–49, 🟡 50–79, 🟢 80–100. The structural-heuristic band (e.g. "no case studies anywhere → cap at 70") is applied *after* the LLM's point total and clamps it, so the deterministic layer always has the final say on the ceiling/floor.

---

**Next step:** Review v2. Once approved, scaffold the Phase A repo (Next.js + Firecrawl + Anthropic API + Vercel) and begin implementation task-by-task, starting with the structural-heuristics layer and the reproducibility regression harness (the two pieces everything else leans on).

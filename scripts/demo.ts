// Offline demo: runs the full engine on the three fixture sites with the deterministic
// mock scorer (no API key, no network). `npm run demo`.
//
// For a LIVE run against a real URL, use `npm run analyze -- <url>` (needs API keys).

import { analyze } from "../src/engine/analyzer.ts";
import { MockStageScorer } from "../src/engine/llm.ts";
import { formatReportText } from "../src/report/format.ts";
import { FIXTURES } from "../src/fixtures/sites.ts";

const AT = "2026-06-28T00:00:00.000Z";

for (const [, pages] of Object.entries(FIXTURES)) {
  const report = await analyze({
    url: pages[0]!.url,
    pages,
    scorer: new MockStageScorer(),
    generatedAt: AT,
  });
  console.log("\n" + formatReportText(report));
}
console.log(
  "\n(Scores use the deterministic mock scorer. Live runs place the score within the same band via claude-opus-4-8.)\n",
);

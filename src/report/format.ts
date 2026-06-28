// Plain-text report formatter, shared by the offline demo and the live runner (and a
// reference for the eventual HTML/PDF renderer in the Next.js UI).

import { stageMeta } from "../engine/types.ts";
import type { Report } from "../engine/types.ts";

const FLAG_ICON = { red: "🔴", yellow: "🟡", green: "🟢" } as const;

export function formatReportText(report: Report): string {
  const lines: string[] = [];
  lines.push("=".repeat(72));
  lines.push(`${FLAG_ICON[report.overallFlag]}  ${report.url}${report.partialCrawl ? "   (⚠ partial crawl)" : ""}`);
  lines.push("=".repeat(72));
  lines.push(`Bottom line: ${report.rootCause.bottomLine}`);
  lines.push("");
  for (const s of report.stages) {
    const m = stageMeta(s.stage);
    const isRoot = report.rootCause.stage === s.stage ? "  ◀ ROOT CAUSE" : "";
    const conf = s.confidence === "partial" ? " (low confidence)" : "";
    lines.push(
      `  ${FLAG_ICON[s.flag]} ${m.label.padEnd(20)} ${String(s.score).padStart(3)}/100   ` +
        `band[${s.band.low}–${s.band.high}]${isRoot}${conf}`,
    );
  }
  lines.push("");
  lines.push("  Prioritized fixes (upstream-first):");
  for (const r of report.recommendations) {
    lines.push(`   • [${r.difficulty}] ${r.finding}`);
  }
  return lines.join("\n");
}

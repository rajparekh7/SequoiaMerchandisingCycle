"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { stageMeta } from "../../../src/engine/types.ts";
import type { Flag, Report } from "../../../src/engine/types.ts";

interface JobResponse {
  id: string;
  status: "running" | "done" | "error";
  step: string;
  url: string;
  report: Report | null;
  error: string | null;
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [job, setJob] = useState<JobResponse | null>(null);
  const [pct, setPct] = useState(8);
  const tickRef = useRef(0);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/analyze/${id}`);
        const data = (await res.json()) as JobResponse;
        if (!alive) return;
        setJob(data);
        tickRef.current += 1;
        setPct((p) => (data.status === "done" ? 100 : Math.min(90, p + 9)));
        if (data.status === "running") setTimeout(poll, 1000);
      } catch {
        if (alive) setTimeout(poll, 1500);
      }
    };
    void poll();
    return () => {
      alive = false;
    };
  }, [id]);

  if (!job) {
    return (
      <main className="container">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (job.status === "error") {
    return (
      <main className="container">
        <h1>Couldn&apos;t finish</h1>
        <p className="error">{job.error}</p>
        <button className="btn" onClick={() => router.push("/")}>
          ← Try another site
        </button>
      </main>
    );
  }

  if (job.status === "running" || !job.report) {
    return (
      <main className="container">
        <h1>Analyzing…</h1>
        <p className="muted" style={{ wordBreak: "break-all" }}>{job.url}</p>
        <div className="progress-wrap">
          <div className="progress-step">{job.step}…</div>
          <div className="bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="muted" style={{ marginTop: 14, fontSize: "0.9rem" }}>
            Crawling ≤20 pages, then scoring five stages. Typically 30–60s.
          </p>
        </div>
      </main>
    );
  }

  return <ReportView report={job.report} />;
}

function dotClass(flag: Flag): string {
  return `dot ${flag}`;
}

function ReportView({ report }: { report: Report }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  return (
    <main className="container">
      <div className="exec">
        <div className="url">{report.url}</div>
        <div className="overall">
          <span className={dotClass(report.overallFlag)} />
          <h2>Merchandising Cycle: {report.overallFlag.toUpperCase()}</h2>
        </div>
        <p className="bottomline">{report.rootCause.bottomLine}</p>
        {report.partialCrawl ? (
          <div className="warn">⚠ Partial crawl — some pages were blocked or slow; affected stages are lower-confidence.</div>
        ) : null}
      </div>

      {report.stages.map((s) => {
        const isRoot = report.rootCause.stage === s.stage;
        return (
          <div key={s.stage} className={`stage${isRoot ? " root" : ""}`}>
            <div className="top">
              <span className={dotClass(s.flag)} />
              <span className="name">{stageMeta(s.stage).label}</span>
              {isRoot ? <span className="root-tag">◀ Root cause</span> : null}
              <span className="score" style={{ marginLeft: isRoot ? 12 : "auto" }}>
                {s.score}/100
              </span>
            </div>
            <div className="gauge">
              <span className={s.flag} style={{ width: `${s.score}%` }} />
            </div>
            <div className="band">
              Heuristic band {s.band.low}–{s.band.high}
              {s.confidence === "partial" ? " · low confidence (partial crawl)" : ""}
            </div>
            {s.evidence.length > 0 ? (
              <ul className="evidence">
                {s.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}

      <div className="recs">
        <h3>Prioritized fixes (upstream-first)</h3>
        {report.recommendations.map((r) => (
          <div key={r.stage} className="rec">
            <div className="finding">
              {r.finding} <span className="diff">{r.difficulty}</span>
            </div>
            <ul>
              {r.actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="actions">
        <button
          className="btn secondary"
          onClick={() => {
            void navigator.clipboard.writeText(window.location.href).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        <button className="btn secondary" onClick={() => window.print()}>
          Save as PDF
        </button>
        <button className="btn" onClick={() => router.push("/")}>
          Analyze another
        </button>
      </div>
    </main>
  );
}

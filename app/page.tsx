"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(body: { url?: string; demo?: string }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Something went wrong.");
        setBusy(false);
        return;
      }
      router.push(`/report/${data.id}`);
    } catch {
      setError("Network error — is the dev server running?");
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <div className="hero">
        <h1>Diagnose why growth stalled — before you fire the sales team.</h1>
        <p className="sub">
          Drop a company URL. Get a scored read on the Sequoia Merchandising Cycle: which of the
          five stages is the real bottleneck, and exactly what to fix first.
        </p>

        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void start({ url });
          }}
        >
          <input
            className="input"
            type="text"
            placeholder="yourcompany.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            aria-label="Company URL"
          />
          <button className="btn" type="submit" disabled={busy || url.trim().length === 0}>
            {busy ? "Starting…" : "Analyze"}
          </button>
        </form>
        {error ? <div className="error">{error}</div> : null}

        <div className="samples">
          <div className="label">No API key? Try a pre-seeded sample report:</div>
          <div className="row">
            <button className="btn secondary" disabled={busy} onClick={() => void start({ demo: "acme" })}>
              Strong site
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => void start({ demo: "midco" })}>
              Mediocre (demand-gen gap)
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => void start({ demo: "brokenco" })}>
              Broken (vision gap)
            </button>
          </div>
        </div>

        <div className="stages-legend">
          <div className="item"><b>Vision</b> — is the ICP and market thesis defensible?</div>
          <div className="item"><b>Product Management</b> — does the deliverable match the promise?</div>
          <div className="item"><b>Product Marketing</b> — is the story crisp, unique, consistent?</div>
          <div className="item"><b>Demand Generation</b> — is the funnel filling with the right leads?</div>
          <div className="item"><b>Sales</b> — can a visitor actually buy?</div>
        </div>
      </div>
    </main>
  );
}

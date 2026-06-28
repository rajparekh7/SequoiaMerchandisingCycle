// POST /api/analyze — enqueue an analysis job, return its id immediately (PRD §6.2).
// The work runs via `after()` so it continues after the response is sent and survives the
// serverless function freeze; state is shared via the KV-backed job store.

import { after } from "next/server";
import { FIXTURES } from "../../../src/fixtures/sites.ts";
import type { FixtureName } from "../../../src/fixtures/sites.ts";
import { runJob } from "../../../src/jobs/runner.ts";
import { createJob } from "../../../src/jobs/store.ts";

export const runtime = "nodejs";
// In-code config is the Vercel-recommended way to set duration for App Router (no
// vercel.json needed). 300s is Hobby's max with fluid compute and is safely within Pro/Ent
// limits; it covers the `after()` background work (crawl + 5 LLM calls) end to end.
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { url?: string; demo?: string };

  if (body.demo) {
    if (!(body.demo in FIXTURES)) {
      return Response.json({ error: "Unknown sample." }, { status: 400 });
    }
    const job = await createJob({ url: `sample:${body.demo}`, mode: "demo" });
    after(() => runJob(job, body.demo as FixtureName));
    return Response.json({ id: job.id });
  }

  let url = body.url?.trim();
  if (!url) return Response.json({ error: "Enter a URL." }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    new URL(url);
  } catch {
    return Response.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
  }

  const job = await createJob({ url, mode: "live" });
  after(() => runJob(job));
  return Response.json({ id: job.id });
}

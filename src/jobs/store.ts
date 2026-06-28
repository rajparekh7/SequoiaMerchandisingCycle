// Async job store. Two backends, chosen at runtime:
//   - Vercel KV / Upstash Redis (when KV_REST_API_URL + token are set) — required on
//     serverless so the POST that creates a job and the polling GET (possibly different
//     lambda instances) share state, and the report survives the function freezing.
//   - In-memory Map fallback for local `npm run dev` (zero config).
//
// KV is driven through Upstash's REST API with fetch — no SDK dependency, same pattern as
// the Anthropic/Firecrawl clients. Jobs expire after 1h (ephemeral V1 share links).

import type { Report } from "../engine/types.ts";

export type JobStatus = "running" | "done" | "error";

export interface Job {
  id: string;
  status: JobStatus;
  step: string;
  url: string;
  mode: "live" | "demo";
  report?: Report;
  error?: string;
  createdAt: number;
}

const TTL_SECONDS = 3600;

// Accept either Vercel KV (KV_REST_API_*) or the Upstash marketplace (UPSTASH_REDIS_REST_*).
const KV_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const useKv = Boolean(KV_URL && KV_TOKEN);

// In-memory fallback (dev). globalThis-attached so it survives HMR/module duplication.
const g = globalThis as unknown as { __mcJobs?: Map<string, Job> };
const mem: Map<string, Job> = g.__mcJobs ?? (g.__mcJobs = new Map());

const key = (id: string) => `job:${id}`;

async function kvCommand(cmd: string[]): Promise<unknown> {
  const res = await fetch(KV_URL as string, {
    method: "POST",
    headers: { authorization: `Bearer ${KV_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`KV ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`KV error: ${data.error}`);
  return data.result ?? null;
}

export async function createJob(init: { url: string; mode: "live" | "demo" }): Promise<Job> {
  const job: Job = {
    id: crypto.randomUUID(),
    status: "running",
    step: "Queued",
    url: init.url,
    mode: init.mode,
    createdAt: Date.now(),
  };
  if (useKv) {
    await kvCommand(["SET", key(job.id), JSON.stringify(job), "EX", String(TTL_SECONDS)]);
  } else {
    mem.set(job.id, job);
  }
  return job;
}

export async function getJob(id: string): Promise<Job | undefined> {
  if (useKv) {
    const raw = (await kvCommand(["GET", key(id)])) as string | null;
    return raw ? (JSON.parse(raw) as Job) : undefined;
  }
  return mem.get(id);
}

// Persist the full job in one SET. The runner owns the job object and is its only writer
// after createJob, so a wholesale save needs no read-modify-write — race-free, half the KV
// ops of a get-then-set. KEEPTTL preserves the expiry set by createJob.
export async function saveJob(job: Job): Promise<void> {
  if (useKv) {
    await kvCommand(["SET", key(job.id), JSON.stringify(job), "KEEPTTL"]);
    return;
  }
  mem.set(job.id, job);
}

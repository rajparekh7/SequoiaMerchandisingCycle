// Async job store with pluggable backends, picked at runtime by which env vars are set:
//   1. Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — Postgres, persistent (PRD §6.1).
//      Share links survive indefinitely. Requires a `jobs` table (see README / SQL below).
//   2. Vercel KV / Upstash Redis (KV_REST_API_URL or UPSTASH_REDIS_REST_URL + token) — fast,
//      1h TTL (ephemeral share links).
//   3. In-memory Map — local `npm run dev` fallback, zero config.
//
// All backends are driven through their REST APIs with fetch — no SDK dependency. The runner
// owns the job object and is its only writer after createJob, so `save` is a wholesale upsert
// (no read-modify-write).
//
// Supabase `jobs` table:
//   create table if not exists jobs (
//     id uuid primary key,
//     data jsonb not null,
//     created_at timestamptz not null default now()
//   );
//   alter table jobs enable row level security;  -- service role bypasses RLS; clients use our API, not Supabase directly

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

interface Backend {
  get(id: string): Promise<Job | undefined>;
  save(job: Job): Promise<void>;
}

const TTL_SECONDS = 3600;

// ---- Supabase (PostgREST) ----
function supabaseBackend(url: string, key: string): Backend {
  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/jobs`;
  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
  return {
    async get(id) {
      const res = await fetch(`${endpoint}?id=eq.${id}&select=data`, { headers });
      if (!res.ok) throw new Error(`Supabase get ${res.status}: ${await res.text()}`);
      const rows = (await res.json()) as Array<{ data: Job }>;
      return rows[0]?.data;
    },
    async save(job) {
      const res = await fetch(`${endpoint}?on_conflict=id`, {
        method: "POST",
        headers: { ...headers, prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: job.id, data: job }),
      });
      if (!res.ok) throw new Error(`Supabase save ${res.status}: ${await res.text()}`);
    },
  };
}

// ---- Vercel KV / Upstash Redis (REST) ----
function kvBackend(url: string, token: string): Backend {
  const command = async (cmd: string[]): Promise<unknown> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(cmd),
    });
    if (!res.ok) throw new Error(`KV ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { result?: unknown; error?: string };
    if (data.error) throw new Error(`KV error: ${data.error}`);
    return data.result ?? null;
  };
  const key = (id: string) => `job:${id}`;
  return {
    async get(id) {
      const raw = (await command(["GET", key(id)])) as string | null;
      return raw ? (JSON.parse(raw) as Job) : undefined;
    },
    async save(job) {
      await command(["SET", key(job.id), JSON.stringify(job), "EX", String(TTL_SECONDS)]);
    },
  };
}

// ---- In-memory (local dev) ----
function memoryBackend(): Backend {
  const g = globalThis as unknown as { __mcJobs?: Map<string, Job> };
  const map = g.__mcJobs ?? (g.__mcJobs = new Map());
  return {
    async get(id) {
      return map.get(id);
    },
    async save(job) {
      map.set(job.id, job);
    },
  };
}

function pickBackend(): Backend {
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supaUrl && supaKey) return supabaseBackend(supaUrl, supaKey);

  const kvUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (kvUrl && kvToken) return kvBackend(kvUrl, kvToken);

  return memoryBackend();
}

const backend = pickBackend();

export async function createJob(init: { url: string; mode: "live" | "demo" }): Promise<Job> {
  const job: Job = {
    id: crypto.randomUUID(),
    status: "running",
    step: "Queued",
    url: init.url,
    mode: init.mode,
    createdAt: Date.now(),
  };
  await backend.save(job);
  return job;
}

export function getJob(id: string): Promise<Job | undefined> {
  return backend.get(id);
}

export function saveJob(job: Job): Promise<void> {
  return backend.save(job);
}

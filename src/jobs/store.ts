// In-memory async-job store (PRD §6.2). V1 only: state lives in the server process, so it
// survives polling within one `next dev`/`next start` instance but NOT serverless cold
// starts or multiple instances. Production swaps this Map for a Supabase `jobs` table
// (PRD §6.1, §11) — the rest of the app only touches the four functions below.

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

// Attach to globalThis so HMR / route-module duplication in dev share one store.
const g = globalThis as unknown as { __mcJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__mcJobs ?? (g.__mcJobs = new Map());

export function createJob(init: { url: string; mode: "live" | "demo" }): Job {
  const id = crypto.randomUUID();
  const job: Job = {
    id,
    status: "running",
    step: "Queued",
    url: init.url,
    mode: init.mode,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<Job>): void {
  const current = jobs.get(id);
  if (current) jobs.set(id, { ...current, ...patch });
}

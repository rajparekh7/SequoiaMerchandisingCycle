// Verifies the job store is wired correctly by doing a real round-trip (create → save →
// read-back → cleanup) against whichever backend the env selects.
//
//   node --env-file=.env.local scripts/check-store.ts
//
// Put SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or the KV vars) in .env.local first.
// Clear pass/fail output; any Supabase/KV connection or permission error is surfaced.

import { createJob, getJob, saveJob, storeBackend } from "../src/jobs/store.ts";

console.log(`Active store backend: ${storeBackend}`);
if (storeBackend === "in-memory") {
  console.log(
    "⚠ No Supabase/KV env vars detected — using the in-memory fallback. This round-trip will",
  );
  console.log(
    "  pass trivially but does NOT verify a real store. Add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY",
  );
  console.log("  (e.g. via `node --env-file=.env.local`) and re-run to test the real backend.");
}

try {
  const job = await createJob({ url: "store-check", mode: "demo" });
  console.log(`created job ${job.id}`);

  job.status = "done";
  job.step = "verified";
  await saveJob(job);

  const read = await getJob(job.id);
  if (read && read.status === "done" && read.step === "verified") {
    console.log(`✓ round-trip OK — ${storeBackend} reads and writes work.`);
  } else {
    console.error("✗ round-trip MISMATCH — read back:", read);
    process.exit(1);
  }
} catch (e) {
  console.error(`✗ store error (${storeBackend}):`, e instanceof Error ? e.message : e);
  console.error("  Supabase: confirm the `jobs` table exists and you used the service_role key.");
  process.exit(1);
}

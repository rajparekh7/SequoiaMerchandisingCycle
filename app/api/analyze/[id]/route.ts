// GET /api/analyze/[id] — job status + report (when done). Polled by the report page.

import { getJob } from "../../../../src/jobs/store.ts";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return Response.json({ error: "Report not found." }, { status: 404 });

  return Response.json({
    id: job.id,
    status: job.status,
    step: job.step,
    url: job.url,
    report: job.report ?? null,
    error: job.error ?? null,
  });
}

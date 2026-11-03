import { getCurrentUser } from "@/server/auth";
import { evaluateDownload } from "@/server/export/access";
import { parseExportFilters } from "@/server/export/csv";
import { createExportJob, listExportJobs } from "@/server/export/jobs";
import {
  assertSameOrigin,
  clientIp,
  jsonError,
  jsonOk,
  rateLimit,
  rateLimitedResponse,
} from "@/server/http";
import { recordAudit } from "@/server/billing";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);
  return jsonOk({ jobs: listExportJobs(user.id) });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }

  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);

  const limit = rateLimit(`export-job:${user.id}:${clientIp(request)}`, 10, 10 * 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfter);

  let body: {
    asset?: unknown;
    period?: unknown;
    from?: unknown;
    to?: unknown;
    dataset?: unknown;
    resolvedOnly?: unknown;
    interval?: unknown;
    format?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }

  const parsed = parseExportFilters({
    asset: typeof body.asset === "string" ? body.asset : undefined,
    period: typeof body.period === "string" ? body.period : undefined,
    from: typeof body.from === "string" ? body.from : undefined,
    to: typeof body.to === "string" ? body.to : undefined,
    dataset: typeof body.dataset === "string" ? body.dataset : undefined,
    resolved: body.resolvedOnly ? "1" : undefined,
    interval: typeof body.interval === "string" ? body.interval : undefined,
    format: typeof body.format === "string" ? body.format : undefined,
  });
  if (!parsed.filters) {
    return jsonError("BAD_FILTERS", parsed.error ?? "Invalid filters.");
  }

  const guard = evaluateDownload(user, parsed.filters);
  if (guard.error) {
    return jsonError(guard.error.code, guard.error.message, guard.error.status);
  }

  try {
    const job = createExportJob(user.id, parsed.filters);
    recordAudit(user.id, "export.create", job.id, {
      filters: parsed.filters,
      estimate: guard.limits?.estimate ?? null,
    });
    return jsonOk({ job }, 201);
  } catch (error) {
    console.error("POST /api/downloads failed", error);
    return jsonError("EXPORT_FAILED", "Could not create the export job.", 500);
  }
}

import {
  apiError,
  apiJson,
  apiPreflight,
  requireApiKey,
} from "@/server/api/v1";
import { evaluateDownload } from "@/server/export/access";
import { parseExportFilters } from "@/server/export/csv";
import { createExportJob, listExportJobs } from "@/server/export/jobs";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const auth = requireApiKey(request, "export:read");
  if (auth.response) return auth.response;
  const { context, meta } = auth;

  return apiJson(
    request,
    {
      data: listExportJobs(context!.user.id),
      meta: { requestId: meta!.requestId },
    },
    meta!,
  );
}

export async function POST(request: Request) {
  const auth = requireApiKey(request, "export:read");
  if (auth.response) return auth.response;
  const { context, meta } = auth;

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
    return apiError(request, "BAD_JSON", "Invalid JSON body.", 400, meta);
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
    return apiError(
      request,
      "BAD_FILTERS",
      parsed.error ?? "Invalid filters.",
      400,
      meta,
    );
  }

  const guard = evaluateDownload(context!.user, parsed.filters);
  if (guard.error) {
    return apiError(
      request,
      guard.error.code,
      guard.error.message,
      guard.error.status,
      meta,
    );
  }

  try {
    const job = createExportJob(
      context!.user.id,
      parsed.filters,
      context!.key.id,
    );
    return apiJson(
      request,
      { data: { ...job, file_path: null } },
      meta!,
      201,
    );
  } catch (error) {
    console.error("POST /api/v1/exports failed", error);
    return apiError(
      request,
      "EXPORT_FAILED",
      "Could not create the export job.",
      500,
      meta,
    );
  }
}

export function OPTIONS(request: Request) {
  return apiPreflight(request);
}

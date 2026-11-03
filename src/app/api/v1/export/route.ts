import { recordApiBytes } from "@/server/api-keys";
import {
  apiError,
  apiHeaders,
  apiPreflight,
  requireApiKey,
} from "@/server/api/v1";
import {
  canStreamDirect,
  evaluateDownload,
} from "@/server/export/access";
import { exportFilename, iterateCsv, parseExportFilters } from "@/server/export/csv";
import { addExportBytes, currentUtcDay } from "@/server/usage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireApiKey(request, "export:read");
  if (auth.response) return auth.response;
  const { context, meta } = auth;
  const params = new URL(request.url).searchParams;

  const parsed = parseExportFilters({
    asset: params.get("asset") ?? undefined,
    period: params.get("period") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    dataset: params.get("dataset") ?? undefined,
    resolved: params.get("resolved") ?? undefined,
    interval: params.get("interval") ?? undefined,
    format: params.get("format") ?? undefined,
  });
  if (!parsed.filters) {
    return apiError(request, "BAD_FILTERS", parsed.error ?? "Invalid filters.", 400, meta);
  }
  if (parsed.filters.format === "csv.gz") {
    return apiError(
      request,
      "USE_ASYNC_EXPORT",
      "Use /api/v1/exports for gzip files.",
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
  if (!canStreamDirect(guard.limits!.estimate)) {
    return apiError(
      request,
      "USE_ASYNC_EXPORT",
      "This selection is too large for a direct download. Create /api/v1/exports instead.",
      413,
      meta,
    );
  }

  const filters = parsed.filters;
  const encoder = new TextEncoder();
  let bytes = 0;
  const day = currentUtcDay();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const line of iterateCsv(filters)) {
          const buffer = encoder.encode(line);
          bytes += buffer.byteLength;
          controller.enqueue(buffer);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        addExportBytes(context!.user.id, bytes);
        recordApiBytes(context!.key.id, day, bytes);
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...Object.fromEntries(apiHeaders(request, meta)),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(filters)}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function OPTIONS(request: Request) {
  return apiPreflight(request);
}

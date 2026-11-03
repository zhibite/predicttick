import { getCurrentUser } from "@/server/auth";
import {
  canStreamDirect,
  evaluateDownload,
} from "@/server/export/access";
import {
  exportFilename,
  iterateCsv,
  parseExportFilters,
} from "@/server/export/csv";
import { addExportBytes } from "@/server/usage";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);

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
    return jsonError("BAD_FILTERS", parsed.error ?? "Invalid filters.");
  }
  if (parsed.filters.format === "csv.gz") {
    return jsonError(
      "USE_BACKGROUND_EXPORT",
      "Use a background export for gzip files.",
      400,
    );
  }

  const guard = evaluateDownload(user, parsed.filters);
  if (guard.error) {
    return jsonError(guard.error.code, guard.error.message, guard.error.status);
  }
  const limits = guard.limits!;
  if (!canStreamDirect(limits.estimate)) {
    return jsonError(
      "USE_BACKGROUND_EXPORT",
      "This selection is too large for a direct download. Create a background export instead.",
      413,
    );
  }

  const filters = parsed.filters;
  const encoder = new TextEncoder();
  let bytes = 0;

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
        // Count partial writes too, so aborted downloads still consume quota.
        addExportBytes(user.id, bytes);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(filters)}"`,
      "Cache-Control": "no-store",
      "X-Export-Estimated-Rows": String(limits.estimate.rows),
    },
  });
}

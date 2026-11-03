import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import {
  apiError,
  apiHeaders,
  apiPreflight,
  requireApiKey,
} from "@/server/api/v1";
import { exportFilename, parseExportFilters } from "@/server/export/csv";
import { EXPORTS_DIR, getExportJob } from "@/server/export/jobs";

export const dynamic = "force-dynamic";

function filenameFor(raw: string): string {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const parsed = parseExportFilters({
      asset: typeof value.asset === "string" ? value.asset : undefined,
      period: typeof value.period === "string" ? value.period : undefined,
      from: typeof value.from === "string" ? value.from : undefined,
      to: typeof value.to === "string" ? value.to : undefined,
      dataset: typeof value.dataset === "string" ? value.dataset : undefined,
      resolved: value.resolvedOnly ? "1" : undefined,
      interval: typeof value.interval === "string" ? value.interval : undefined,
      format: typeof value.format === "string" ? value.format : undefined,
    });
    return parsed.filters
      ? exportFilename(parsed.filters)
      : "polyklines_export.csv";
  } catch {
    return "polyklines_export.csv";
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiKey(request, "export:read");
  if (auth.response) return auth.response;
  const { context, meta } = auth;
  const { id } = await params;

  const job = getExportJob(id);
  if (!job) {
    return apiError(request, "NOT_FOUND", "Export job not found.", 404, meta);
  }
  if (job.user_id !== context!.user.id && context!.user.role !== "admin") {
    return apiError(
      request,
      "FORBIDDEN",
      "This export belongs to another account.",
      403,
      meta,
    );
  }
  if (job.status !== "done" || !job.file_path) {
    return apiError(request, "NOT_READY", "This export is not ready yet.", 409, meta);
  }
  if (job.expires_at != null && job.expires_at < Math.floor(Date.now() / 1000)) {
    return apiError(request, "EXPIRED", "This export file has expired.", 410, meta);
  }

  const filePath = path.resolve(job.file_path);
  const root = path.resolve(EXPORTS_DIR) + path.sep;
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
    return apiError(request, "NOT_FOUND", "Export file is missing.", 404, meta);
  }

  const stat = fs.statSync(filePath);
  const filename = filenameFor(job.filters_json);
  const contentType =
    job.format === "csv.gz" ? "application/gzip" : "text/csv; charset=utf-8";
  const baseHeaders = {
    ...Object.fromEntries(apiHeaders(request, meta)),
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  };
  const range = request.headers.get("range");

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start >= 0 &&
        end >= start &&
        start < stat.size
      ) {
        const boundedEnd = Math.min(end, stat.size - 1);
        const stream = fs.createReadStream(filePath, {
          start,
          end: boundedEnd,
        });
        return new Response(
          Readable.toWeb(stream) as unknown as ReadableStream,
          {
            status: 206,
            headers: {
              ...baseHeaders,
              "Content-Type": contentType,
              "Content-Length": String(boundedEnd - start + 1),
              "Content-Range": `bytes ${start}-${boundedEnd}/${stat.size}`,
            },
          },
        );
      }
    }
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${stat.size}` },
    });
  }

  return new Response(
    Readable.toWeb(fs.createReadStream(filePath)) as unknown as ReadableStream,
    {
      headers: {
        ...baseHeaders,
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
      },
    },
  );
}

export function OPTIONS(request: Request) {
  return apiPreflight(request);
}

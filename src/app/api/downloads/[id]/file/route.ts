import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { getCurrentUser } from "@/server/auth";
import { exportFilename, parseExportFilters } from "@/server/export/csv";
import { EXPORTS_DIR, getExportJob } from "@/server/export/jobs";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

function filenameFor(jobFilters: string): string {
  try {
    const value = JSON.parse(jobFilters) as Record<string, unknown>;
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
    return parsed.filters ? exportFilename(parsed.filters) : "polyklines_export.csv";
  } catch {
    return "polyklines_export.csv";
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);
  if (user.role !== "admin" && !user.access.isPaid) {
    return jsonError(
      "PAYMENT_REQUIRED",
      "An active access pass is required to download exports.",
      402,
    );
  }

  const { id } = await params;
  const job = getExportJob(id);
  if (!job) return jsonError("NOT_FOUND", "Export job not found.", 404);
  if (job.user_id !== user.id && user.role !== "admin") {
    return jsonError("FORBIDDEN", "This export belongs to another account.", 403);
  }
  if (job.status !== "done" || !job.file_path) {
    return jsonError("NOT_READY", "This export is not ready yet.", 409);
  }
  if (job.expires_at != null && job.expires_at < Math.floor(Date.now() / 1000)) {
    return jsonError("EXPIRED", "This export file has expired.", 410);
  }

  const filePath = path.resolve(job.file_path);
  const root = path.resolve(EXPORTS_DIR) + path.sep;
  if (!filePath.startsWith(root)) {
    return jsonError("INVALID_PATH", "Invalid export file.", 400);
  }
  if (!fs.existsSync(filePath)) {
    return jsonError("NOT_FOUND", "Export file is missing.", 404);
  }

  const stat = fs.statSync(filePath);
  const filename = filenameFor(job.filters_json);
  const contentType =
    job.format === "csv.gz" ? "application/gzip" : "text/csv; charset=utf-8";
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
              "Content-Type": contentType,
              "Content-Disposition": `attachment; filename="${filename}"`,
              "Content-Length": String(boundedEnd - start + 1),
              "Content-Range": `bytes ${start}-${boundedEnd}/${stat.size}`,
              "Accept-Ranges": "bytes",
              "Cache-Control": "private, no-store",
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

  const stream = fs.createReadStream(filePath);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    },
  });
}

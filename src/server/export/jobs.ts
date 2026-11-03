import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

import { getAppDb } from "@/server/app-db";
import { recordApiBytes } from "@/server/api-keys";
import { getUserById } from "@/server/users";
import { getEntitlements } from "@/server/entitlements";
import { addExportBytes, getUsage, utcDayFromEpoch } from "@/server/usage";

import {
  estimateExport,
  iterateCsv,
  parseExportFilters,
} from "./csv";
import type { ExportFilters } from "./csv";

export const EXPORTS_DIR =
  process.env.POLY_EXPORT_DIR?.trim() ||
  path.join(process.cwd(), "data", "exports");

export interface ExportJobRow {
  id: string;
  user_id: string;
  api_key_id: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  status: string;
  filters_json: string;
  format: string;
  file_path: string | null;
  rows: number | null;
  bytes: number | null;
  error: string | null;
  expires_at: number | null;
  progress: number;
  processed_rows: number;
}

export function createExportJob(
  userId: string,
  filters: ExportFilters,
  apiKeyId: string | null = null,
): ExportJobRow {
  const db = getAppDb();
  const now = Math.floor(Date.now() / 1000);
  const id = `exp_${randomUUID().replace(/-/g, "")}`;

  db.prepare(
    `INSERT INTO export_jobs
       (id, user_id, api_key_id, created_at, status, filters_json, format,
        progress, processed_rows, expires_at)
     VALUES (?, ?, ?, ?, 'queued', ?, ?, 0, 0, NULL)`,
  ).run(
    id,
    userId,
    apiKeyId,
    now,
    JSON.stringify(filters),
    filters.format,
  );

  return getExportJob(id)!;
}

export function listExportJobs(userId: string): ExportJobRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM export_jobs WHERE user_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 100`,
    )
    .all(userId) as unknown as ExportJobRow[];
  // Do not expose server filesystem paths to the browser.
  return rows.map((row) => ({ ...row, file_path: null }));
}

export function getExportJob(id: string): ExportJobRow | null {
  const row = getAppDb()
    .prepare("SELECT * FROM export_jobs WHERE id = ?")
    .get(id) as unknown as ExportJobRow | undefined;
  return row ? { ...row } : null;
}

function queuedJob(): ExportJobRow | null {
  const row = getAppDb()
    .prepare(
      `SELECT * FROM export_jobs WHERE status = 'queued'
       ORDER BY created_at, id LIMIT 1`,
    )
    .get() as unknown as ExportJobRow | undefined;
  return row ? { ...row } : null;
}

function markRunning(id: string): void {
  const now = Math.floor(Date.now() / 1000);
  getAppDb()
    .prepare(
      `UPDATE export_jobs
       SET status = 'running', started_at = ?, progress = 0, processed_rows = 0
       WHERE id = ? AND status = 'queued'`,
    )
    .run(now, id);
}

function updateProgress(id: string, rows: number, totalRows: number, bytes: number): void {
  const progress = totalRows > 0 ? Math.min(1, rows / totalRows) : 0;
  getAppDb()
    .prepare(
      `UPDATE export_jobs
       SET progress = ?, processed_rows = ?, bytes = ?
       WHERE id = ? AND status = 'running'`,
    )
    .run(progress, rows, bytes, id);
}

function markDone(
  id: string,
  rows: number,
  bytes: number,
  filePath: string,
  expiresAt: number,
): void {
  getAppDb()
    .prepare(
      `UPDATE export_jobs
       SET status = 'done', finished_at = ?, rows = ?, bytes = ?,
           file_path = ?, expires_at = ?, progress = 1, processed_rows = ?
       WHERE id = ? AND status = 'running'`,
    )
    .run(
      Math.floor(Date.now() / 1000),
      rows,
      bytes,
      filePath,
      expiresAt,
      rows,
      id,
    );
}

function markFailed(id: string, error: string): void {
  getAppDb()
    .prepare(
      `UPDATE export_jobs
       SET status = 'failed', finished_at = ?, error = ?, progress = 0
       WHERE id = ? AND status IN ('queued', 'running')`,
    )
    .run(Math.floor(Date.now() / 1000), error, id);
}

function parseStoredFilters(raw: string): ExportFilters | null {
  try {
    const value = JSON.parse(raw) as Partial<ExportFilters>;
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
    return parsed.filters ?? null;
  } catch {
    return null;
  }
}

function removeFile(filePath: string | null): void {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Already gone.
  }
}

export async function processNextExportJob(): Promise<boolean> {
  const job = queuedJob();
  if (!job) return false;

  markRunning(job.id);
  const current = getExportJob(job.id);
  if (!current) return true;

  const filters = parseStoredFilters(current.filters_json);
  if (!filters) {
    markFailed(job.id, "Invalid stored export filters.");
    return true;
  }

  const user = getUserById(job.user_id);
  if (!user || (user.role !== "admin" && !user.access.isPaid)) {
    markFailed(job.id, "Access pass expired before the export ran.");
    return true;
  }

  const entitlements = getEntitlements(user);
  const usage = getUsage(user.id);
  const estimate = estimateExport(filters);
  if (
    entitlements.exportBytesPerDay <= 0 ||
    usage.exportBytes + estimate.bytes > entitlements.exportBytesPerDay
  ) {
    markFailed(job.id, "Daily export quota exceeded.");
    return true;
  }

  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const gzip = filters.format === "csv.gz";
  const filePath = path.join(
    EXPORTS_DIR,
    `${job.id}.${gzip ? "csv.gz" : "csv"}`,
  );

  let rows = 0;
  let bytes = 0;
  let lastProgressAt = 0;
  let firstChunk = true;

  const counter = new Transform({
    transform(chunk, encoding, callback) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as string, encoding);
      bytes += buffer.length;
      if (firstChunk) {
        // The first line is the CSV header; do not count it as a data row.
        firstChunk = false;
      } else {
        rows += 1;
      }
      const now = Date.now();
      if (now - lastProgressAt >= 1_000) {
        lastProgressAt = now;
        updateProgress(job.id, rows, estimate.rows, bytes);
      }
      callback(null, buffer);
    },
  });

  try {
    const source = Readable.from(iterateCsv(filters));
    const destination = fs.createWriteStream(filePath);
    if (gzip) {
      await pipeline(source, counter, createGzip(), destination);
    } else {
      await pipeline(source, counter, destination);
    }

    const finishedAt = Math.floor(Date.now() / 1000);
    const expiresAt = finishedAt + entitlements.exportRetentionDays * 86_400;
    markDone(job.id, rows, bytes, filePath, expiresAt);
    addExportBytes(user.id, bytes);
    if (current.api_key_id) {
      recordApiBytes(
        current.api_key_id,
        utcDayFromEpoch(finishedAt),
        bytes,
      );
    }
    return true;
  } catch (error) {
    removeFile(filePath);
    markFailed(
      job.id,
      error instanceof Error ? error.message : String(error),
    );
    return true;
  }
}

export function cleanupExpiredExportJobs(): void {
  const now = Math.floor(Date.now() / 1000);
  const db = getAppDb();
  const rows = db
    .prepare(
      `SELECT id, file_path FROM export_jobs
       WHERE expires_at IS NOT NULL AND expires_at < ? AND file_path IS NOT NULL`,
    )
    .all(now) as unknown as Array<{ id: string; file_path: string }>;

  for (const row of rows) {
    removeFile(row.file_path);
    db.prepare(
      `UPDATE export_jobs SET file_path = NULL, status = 'expired'
       WHERE id = ? AND status = 'done'`,
    ).run(row.id);
  }
}

import fs from "node:fs";
import path from "node:path";

import { APP_DB_PATH, getAppDb } from "./app-db";
import { DB_PATH, getDb } from "./db";
import { getJobWorkerStatus, type JobWorkerStatus } from "./jobs/status";
import { getCollectorStatus } from "./query/markets";
import type { StatusRow } from "./query/types";

interface CountRow {
  status: string;
  n: number;
}

export interface SystemStatus {
  now: number;
  collector: StatusRow | null;
  collectorHeartbeatAge: number | null;
  jobs: JobWorkerStatus | null;
  jobsHeartbeatAge: number | null;
  queues: {
    exports: Record<string, number>;
    backtests: Record<string, number>;
    sweeps: Record<string, number>;
  };
  recentFailures: {
    exports: Array<{ id: string; createdAt: number; error: string | null }>;
    backtests: Array<{ id: string; createdAt: number; error: string | null }>;
  };
  disk: {
    totalBytes: number;
    freeBytes: number;
    usedPercent: number;
  };
  database: {
    marketBytes: number;
    marketWalBytes: number;
    appBytes: number;
    appWalBytes: number;
  };
  status: "ok" | "degraded" | "critical";
}

function tableCounts(
  table: "export_jobs" | "backtest_runs" | "backtest_sweeps",
): Record<string, number> {
  const rows = getAppDb()
    .prepare(`SELECT status, COUNT(*) AS n FROM ${table} GROUP BY status`)
    .all() as unknown as CountRow[];
  return Object.fromEntries(rows.map((row) => [row.status, row.n]));
}

function fileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function diskStatus(): SystemStatus["disk"] {
  try {
    const root = path.parse(process.cwd()).root;
    const stat = fs.statfsSync(root);
    const totalBytes = Number(stat.blocks) * Number(stat.bsize);
    const freeBytes = Number(stat.bavail) * Number(stat.bsize);
    return {
      totalBytes,
      freeBytes,
      usedPercent:
        totalBytes > 0 ? ((totalBytes - freeBytes) / totalBytes) * 100 : 0,
    };
  } catch {
    return { totalBytes: 0, freeBytes: 0, usedPercent: 0 };
  }
}

export function getSystemStatus(): SystemStatus {
  const now = Math.floor(Date.now() / 1000);
  const collector = getCollectorStatus();
  const jobs = getJobWorkerStatus();
  const queues = {
    exports: tableCounts("export_jobs"),
    backtests: tableCounts("backtest_runs"),
    sweeps: tableCounts("backtest_sweeps"),
  };
  const exportFailures = getAppDb()
    .prepare(
      `SELECT id, created_at, error FROM export_jobs
       WHERE status = 'failed' ORDER BY created_at DESC LIMIT 5`,
    )
    .all() as unknown as Array<{
    id: string;
    created_at: number;
    error: string | null;
  }>;
  const backtestFailures = getAppDb()
    .prepare(
      `SELECT id, created_at, error FROM backtest_runs
       WHERE status = 'failed' ORDER BY created_at DESC LIMIT 5`,
    )
    .all() as unknown as Array<{
    id: string;
    created_at: number;
    error: string | null;
  }>;

  const collectorHeartbeatAge =
    collector?.heartbeat_at != null ? now - collector.heartbeat_at : null;
  const jobsHeartbeatAge =
    jobs?.heartbeatAt != null ? now - jobs.heartbeatAt : null;
  const disk = diskStatus();

  let status: SystemStatus["status"] = "ok";
  if (
    (collectorHeartbeatAge == null || collectorHeartbeatAge > 60) ||
    (jobsHeartbeatAge == null || jobsHeartbeatAge > 60)
  ) {
    status = "degraded";
  }
  if (disk.totalBytes > 0 && disk.freeBytes < 5 * 1024 ** 3) {
    status = "critical";
  }

  // Ensure both DB handles are initialized and migrations have run.
  getDb();

  return {
    now,
    collector,
    collectorHeartbeatAge,
    jobs,
    jobsHeartbeatAge,
    queues,
    recentFailures: {
      exports: exportFailures.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        error: row.error,
      })),
      backtests: backtestFailures.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        error: row.error,
      })),
    },
    disk,
    database: {
      marketBytes: fileSize(DB_PATH),
      marketWalBytes: fileSize(`${DB_PATH}-wal`),
      appBytes: fileSize(APP_DB_PATH),
      appWalBytes: fileSize(`${APP_DB_PATH}-wal`),
    },
    status,
  };
}

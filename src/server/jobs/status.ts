import { getAppDb } from "@/server/app-db";

export interface JobWorkerStatus {
  startedAt: number | null;
  heartbeatAt: number | null;
  exportLastAt: number | null;
  backtestLastAt: number | null;
  lastError: string | null;
  pid: number | null;
}

export function initJobWorkerStatus(): void {
  const now = Math.floor(Date.now() / 1000);
  getAppDb()
    .prepare(
      `INSERT INTO job_worker_status
         (id, started_at, heartbeat_at, export_last_at, backtest_last_at, last_error, pid)
       VALUES (1, ?, ?, NULL, NULL, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         started_at = excluded.started_at,
         heartbeat_at = excluded.heartbeat_at,
         last_error = NULL,
         pid = excluded.pid`,
    )
    .run(now, now, process.pid);
}

export function touchJobWorker(kind: "export" | "backtest"): void {
  const now = Math.floor(Date.now() / 1000);
  const column = kind === "export" ? "export_last_at" : "backtest_last_at";
  getAppDb()
    .prepare(
      `UPDATE job_worker_status
       SET heartbeat_at = ?, ${column} = ?, pid = ?
       WHERE id = 1`,
    )
    .run(now, now, process.pid);
}

export function noteJobWorkerError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  getAppDb()
    .prepare(
      `UPDATE job_worker_status
       SET heartbeat_at = ?, last_error = ?, pid = ?
       WHERE id = 1`,
    )
    .run(
      Math.floor(Date.now() / 1000),
      message.slice(0, 2_000),
      process.pid,
    );
}

export function getJobWorkerStatus(): JobWorkerStatus | null {
  const row = getAppDb()
    .prepare(
      `SELECT started_at, heartbeat_at, export_last_at, backtest_last_at,
              last_error, pid
       FROM job_worker_status WHERE id = 1`,
    )
    .get() as unknown as
    | {
        started_at: number | null;
        heartbeat_at: number | null;
        export_last_at: number | null;
        backtest_last_at: number | null;
        last_error: string | null;
        pid: number | null;
      }
    | undefined;
  if (!row) return null;
  return {
    startedAt: row.started_at,
    heartbeatAt: row.heartbeat_at,
    exportLastAt: row.export_last_at,
    backtestLastAt: row.backtest_last_at,
    lastError: row.last_error,
    pid: row.pid,
  };
}

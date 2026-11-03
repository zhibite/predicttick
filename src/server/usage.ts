import { getAppDb } from "./app-db";

export interface Usage {
  day: string;
  apiRequests: number;
  exportBytes: number;
  backtestRuns: number;
  backtestWindows: number;
}

export function utcDayFromEpoch(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

export function currentUtcDay(): string {
  return utcDayFromEpoch(Math.floor(Date.now() / 1000));
}

export function getUsage(userId: string, day = currentUtcDay()): Usage {
  const row = getAppDb()
    .prepare(
      `SELECT api_requests, export_bytes, backtest_runs, backtest_windows
       FROM usage_daily WHERE user_id = ? AND day = ?`,
    )
    .get(userId, day) as unknown as
    | {
        api_requests: number;
        export_bytes: number;
        backtest_runs: number;
        backtest_windows: number;
      }
    | undefined;

  return {
    day,
    apiRequests: row?.api_requests ?? 0,
    exportBytes: row?.export_bytes ?? 0,
    backtestRuns: row?.backtest_runs ?? 0,
    backtestWindows: row?.backtest_windows ?? 0,
  };
}

export function addBacktestRun(userId: string): void {
  getAppDb()
    .prepare(
      `INSERT INTO usage_daily (user_id, day, backtest_runs)
       VALUES (?, ?, 1)
       ON CONFLICT(user_id, day) DO UPDATE SET
         backtest_runs = backtest_runs + 1`,
    )
    .run(userId, currentUtcDay());
}

export function addBacktestWindows(userId: string, windows: number): void {
  if (!Number.isFinite(windows) || windows <= 0) return;
  getAppDb()
    .prepare(
      `INSERT INTO usage_daily (user_id, day, backtest_windows)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET
         backtest_windows = backtest_windows + excluded.backtest_windows`,
    )
    .run(userId, currentUtcDay(), Math.floor(windows));
}

export function addExportBytes(userId: string, bytes: number): void {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  getAppDb()
    .prepare(
      `INSERT INTO usage_daily (user_id, day, export_bytes)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET
         export_bytes = export_bytes + excluded.export_bytes`,
    )
    .run(userId, currentUtcDay(), Math.floor(bytes));
}

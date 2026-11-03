import { getAppDb } from "./app-db";
import { currentUtcDay, utcDayFromEpoch } from "./usage";

export interface UsageDay {
  day: string;
  apiRequests: number;
  exportBytes: number;
  backtestRuns: number;
  backtestWindows: number;
}

export interface ApiKeyUsageDay {
  keyId: string;
  name: string;
  prefix: string;
  day: string;
  requests: number;
  bytes: number;
}

export function getUsageHistory(userId: string, days = 14): UsageDay[] {
  const now = Math.floor(Date.now() / 1000);
  const fromDay = utcDayFromEpoch(now - (days - 1) * 86_400);
  const rows = getAppDb()
    .prepare(
      `SELECT day, api_requests, export_bytes, backtest_runs, backtest_windows
       FROM usage_daily
       WHERE user_id = ? AND day >= ?
       ORDER BY day DESC`,
    )
    .all(userId, fromDay) as unknown as Array<{
    day: string;
    api_requests: number;
    export_bytes: number;
    backtest_runs: number;
    backtest_windows: number;
  }>;

  return rows.map((row) => ({
    day: row.day,
    apiRequests: row.api_requests,
    exportBytes: row.export_bytes,
    backtestRuns: row.backtest_runs,
    backtestWindows: row.backtest_windows,
  }));
}

export function getApiKeyUsageHistory(
  userId: string,
  days = 14,
): ApiKeyUsageDay[] {
  const now = Math.floor(Date.now() / 1000);
  const fromDay = utcDayFromEpoch(now - (days - 1) * 86_400);
  const rows = getAppDb()
    .prepare(
      `SELECT k.id AS key_id, k.name, k.prefix, a.day, a.requests, a.bytes
       FROM api_usage_daily a
       JOIN api_keys k ON k.id = a.key_id
       WHERE k.user_id = ? AND a.day >= ?
       ORDER BY a.day DESC, k.name`,
    )
    .all(userId, fromDay) as unknown as Array<{
    key_id: string;
    name: string;
    prefix: string;
    day: string;
    requests: number;
    bytes: number;
  }>;

  return rows.map((row) => ({
    keyId: row.key_id,
    name: row.name,
    prefix: row.prefix,
    day: row.day,
    requests: row.requests,
    bytes: row.bytes,
  }));
}

export function todayUsageLabel(): string {
  return currentUtcDay();
}

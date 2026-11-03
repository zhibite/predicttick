import { getDb } from "@/server/db";

import type { SeriesDayRow } from "./types";

export interface Coverage {
  asset: string;
  period: string;
  from: string | null;
  to: string | null;
  days: number;
  markets: number;
  resolved: number;
  samples: number;
  firstDay: string | null;
  lastDay: string | null;
  seriesDays: SeriesDayRow[];
}

export function listSeriesDays(
  asset: string,
  period: string,
  fromDay?: string,
  toDay?: string,
): SeriesDayRow[] {
  const db = getDb();
  const hasRange = Boolean(fromDay && toDay);
  const sql = hasRange
    ? `SELECT asset, period, day, markets, resolved, samples, updated_at
       FROM series_days
       WHERE asset = ? AND period = ? AND day >= ? AND day <= ?
       ORDER BY day`
    : `SELECT asset, period, day, markets, resolved, samples, updated_at
       FROM series_days
       WHERE asset = ? AND period = ?
       ORDER BY day`;
  if (fromDay && toDay) {
    return db
      .prepare(sql)
      .all(asset, period, fromDay, toDay) as unknown as SeriesDayRow[];
  }
  return db.prepare(sql).all(asset, period) as unknown as SeriesDayRow[];
}

export function getCoverage(
  asset: string,
  period: string,
  fromDay?: string,
  toDay?: string,
): Coverage {
  const seriesDays = listSeriesDays(asset, period, fromDay, toDay);
  let markets = 0;
  let resolved = 0;
  let samples = 0;

  for (const row of seriesDays) {
    markets += row.markets;
    resolved += row.resolved;
    samples += row.samples;
  }

  return {
    asset,
    period,
    from: fromDay ?? null,
    to: toDay ?? null,
    days: seriesDays.length,
    markets,
    resolved,
    samples,
    firstDay: seriesDays[0]?.day ?? null,
    lastDay: seriesDays[seriesDays.length - 1]?.day ?? null,
    seriesDays,
  };
}

export interface ExportEstimate {
  markets: number;
  rows: number;
  bytes: number;
}

/**
 * Rough CSV size estimate. Actual output depends on selected columns and
 * compression, but this is enough to choose direct streaming versus a
 * background export job.
 */
export function estimateExport(
  asset: string,
  period: string,
  fromDay: string,
  toDay: string,
): ExportEstimate {
  const coverage = getCoverage(asset, period, fromDay, toDay);
  const rows = coverage.samples;
  // ~120 bytes per sample row including the market metadata columns.
  return {
    markets: coverage.markets,
    rows,
    bytes: rows * 120,
  };
}

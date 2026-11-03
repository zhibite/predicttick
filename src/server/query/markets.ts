import { getDb } from "@/server/db";

import type {
  ApiMarketRow,
  DateRow,
  DayMarketRow,
  ExportMarketRow,
  MarketRow,
  MarketStatsRow,
  SeriesRow,
  StatusRow,
} from "./types";

export function listSeriesRows(): SeriesRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT asset, period, COUNT(*) AS markets,
              MIN(start_epoch) AS first_epoch,
              MAX(start_epoch) AS last_epoch
       FROM markets
       GROUP BY asset, period`,
    )
    .all() as unknown as SeriesRow[];
}

/**
 * Prefer the pre-aggregated series_days table. Fall back to scanning markets
 * when the rollup has not been backfilled yet, so the explorer works during
 * the migration window.
 */
export function listDates(asset: string, period: string): string[] {
  const db = getDb();
  const rolled = db
    .prepare(
      `SELECT day AS d FROM series_days
       WHERE asset = ? AND period = ?
       ORDER BY day`,
    )
    .all(asset, period) as unknown as DateRow[];
  if (rolled.length > 0) return rolled.map((row) => row.d);

  return (
    db
      .prepare(
        `SELECT DISTINCT strftime('%Y-%m-%d', start_epoch, 'unixepoch') AS d
         FROM markets
         WHERE asset = ? AND period = ?
         ORDER BY d`,
      )
      .all(asset, period) as unknown as DateRow[]
  ).map((row) => row.d);
}

export function listDayMarkets(
  asset: string,
  period: string,
  dayStart: number,
  dayEnd: number,
): DayMarketRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT m.slug, m.asset, m.period, m.start_epoch, m.end_epoch,
              m.title, m.resolved,
              COALESCE(ms.sample_count,
                (SELECT COUNT(*) FROM samples s WHERE s.slug = m.slug)) AS n
       FROM markets m
       LEFT JOIN market_stats ms ON ms.slug = m.slug
       WHERE m.asset = ? AND m.period = ?
         AND m.start_epoch >= ? AND m.start_epoch < ?
       ORDER BY m.start_epoch DESC`,
    )
    .all(asset, period, dayStart, dayEnd) as unknown as DayMarketRow[];
}

export function listExportMarkets(
  asset: string,
  period: string,
  dayStart: number,
  dayEnd: number,
  resolvedOnly: boolean,
): ExportMarketRow[] {
  const db = getDb();
  const resolvedFilter = resolvedOnly
    ? "AND resolved IN ('UP', 'DOWN')"
    : "";
  return db
    .prepare(
      `SELECT slug, asset, period, start_epoch, end_epoch, title, resolved,
              condition_id, up_token, down_token, finalized_at
       FROM markets
       WHERE asset = ? AND period = ?
         AND start_epoch >= ? AND start_epoch < ?
         ${resolvedFilter}
       ORDER BY start_epoch`,
    )
    .all(asset, period, dayStart, dayEnd) as unknown as ExportMarketRow[];
}

export function listMarketsPage(options: {
  asset: string;
  period: string;
  fromEpoch: number;
  toEpochExclusive: number;
  resolved?: string | null;
  cursorStart?: number | null;
  cursorSlug?: string | null;
  limit: number;
}): ApiMarketRow[] {
  const db = getDb();
  const conditions = [
    "m.asset = ?",
    "m.period = ?",
    "m.start_epoch >= ?",
    "m.start_epoch < ?",
  ];
  const args: Array<string | number> = [
    options.asset,
    options.period,
    options.fromEpoch,
    options.toEpochExclusive,
  ];

  if (options.resolved) {
    conditions.push("m.resolved = ?");
    args.push(options.resolved);
  }
  if (options.cursorStart != null && options.cursorSlug) {
    conditions.push(
      "(m.start_epoch < ? OR (m.start_epoch = ? AND m.slug < ?))",
    );
    args.push(options.cursorStart, options.cursorStart, options.cursorSlug);
  }
  args.push(options.limit);

  return db
    .prepare(
      `SELECT m.slug, m.asset, m.period, m.start_epoch, m.end_epoch,
              m.title, m.resolved,
              COALESCE(ms.sample_count,
                (SELECT COUNT(*) FROM samples s WHERE s.slug = m.slug)) AS sample_count,
              ms.first_ts, ms.last_ts
       FROM markets m
       LEFT JOIN market_stats ms ON ms.slug = m.slug
       WHERE ${conditions.join(" AND ")}
       ORDER BY m.start_epoch DESC, m.slug DESC
       LIMIT ?`,
    )
    .all(...args) as unknown as ApiMarketRow[];
}

export function getMarketWithStats(slug: string): ApiMarketRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT m.slug, m.asset, m.period, m.start_epoch, m.end_epoch,
              m.title, m.resolved,
              COALESCE(ms.sample_count,
                (SELECT COUNT(*) FROM samples s WHERE s.slug = m.slug)) AS sample_count,
              ms.first_ts, ms.last_ts
       FROM markets m
       LEFT JOIN market_stats ms ON ms.slug = m.slug
       WHERE m.slug = ?`,
    )
    .get(slug) as unknown as ApiMarketRow | undefined;
  return row ? { ...row } : null;
}

export function getMarketRow(slug: string): MarketRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT slug, asset, period, start_epoch, end_epoch, title, resolved
       FROM markets WHERE slug = ?`,
    )
    .get(slug) as unknown as MarketRow | undefined;
  return row ?? null;
}

export function getMarketStatsRow(slug: string): MarketStatsRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT slug, sample_count, first_ts, last_ts,
              up_open, up_high, up_low, up_close,
              down_open, down_high, down_low, down_close, computed_at
       FROM market_stats WHERE slug = ?`,
    )
    .get(slug) as unknown as MarketStatsRow | undefined;
  return row ?? null;
}

export function getCollectorStatus(): StatusRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT started_at, heartbeat_at, ws_connections, active_markets,
              messages_total, samples_total, last_error
       FROM collector_status WHERE id = 1`,
    )
    .get() as unknown as StatusRow | undefined;
  return row ?? null;
}

export function getSamplesTotal(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT samples_total AS n FROM stats WHERE id = 1")
    .get() as unknown as { n: number } | undefined;
  return row?.n ?? 0;
}

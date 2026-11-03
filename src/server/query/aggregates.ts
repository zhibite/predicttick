import { getDb } from "@/server/db";

import type { MarketStatsRow } from "./types";

function priceExpr(side: "up" | "down"): string {
  return `COALESCE(${side}_mid, ${side}_last, (${side}_bid + ${side}_ask) / 2.0)`;
}

interface AggregateRow {
  sample_count: number;
  first_ts: number | null;
  last_ts: number | null;
  up_high: number | null;
  up_low: number | null;
  down_high: number | null;
  down_low: number | null;
}

interface EdgeRow {
  up_open: number | null;
  down_open: number | null;
}

export function utcDay(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

export function computeMarketStats(
  slug: string,
  startEpoch: number,
  endEpoch: number,
): MarketStatsRow {
  const db = getDb();
  const up = priceExpr("up");
  const down = priceExpr("down");

  const aggregate = db
    .prepare(
      `SELECT COUNT(*) AS sample_count,
              MIN(ts) AS first_ts,
              MAX(ts) AS last_ts,
              MAX(${up}) AS up_high,
              MIN(${up}) AS up_low,
              MAX(${down}) AS down_high,
              MIN(${down}) AS down_low
       FROM samples
       WHERE slug = ? AND ts >= ? AND ts < ?`,
    )
    .get(slug, startEpoch, endEpoch) as unknown as AggregateRow;

  const edgeSql = `
    SELECT ${up} AS up_open, ${down} AS down_open
    FROM samples
    WHERE slug = ? AND ts >= ? AND ts < ?
      AND (${up} IS NOT NULL OR ${down} IS NOT NULL)
    ORDER BY ts`;

  const first = db
    .prepare(`${edgeSql} LIMIT 1`)
    .get(slug, startEpoch, endEpoch) as unknown as EdgeRow | undefined;
  const last = db
    .prepare(`${edgeSql} DESC LIMIT 1`)
    .get(slug, startEpoch, endEpoch) as unknown as EdgeRow | undefined;

  return {
    slug,
    sample_count: aggregate.sample_count,
    first_ts: aggregate.first_ts,
    last_ts: aggregate.last_ts,
    up_open: first?.up_open ?? null,
    up_high: aggregate.up_high,
    up_low: aggregate.up_low,
    up_close: last?.up_open ?? null,
    down_open: first?.down_open ?? null,
    down_high: aggregate.down_high,
    down_low: aggregate.down_low,
    down_close: last?.down_open ?? null,
    computed_at: Math.floor(Date.now() / 1000),
  };
}

export function storeMarketStats(stats: MarketStatsRow): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO market_stats (
       slug, sample_count, first_ts, last_ts,
       up_open, up_high, up_low, up_close,
       down_open, down_high, down_low, down_close, computed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       sample_count = excluded.sample_count,
       first_ts = excluded.first_ts,
       last_ts = excluded.last_ts,
       up_open = excluded.up_open,
       up_high = excluded.up_high,
       up_low = excluded.up_low,
       up_close = excluded.up_close,
       down_open = excluded.down_open,
       down_high = excluded.down_high,
       down_low = excluded.down_low,
       down_close = excluded.down_close,
       computed_at = excluded.computed_at`,
  ).run(
    stats.slug,
    stats.sample_count,
    stats.first_ts,
    stats.last_ts,
    stats.up_open,
    stats.up_high,
    stats.up_low,
    stats.up_close,
    stats.down_open,
    stats.down_high,
    stats.down_low,
    stats.down_close,
    stats.computed_at,
  );
}

/**
 * Rebuild one (asset, period, day) coverage row from markets and the
 * per-market stats. Recomputation keeps late resolution changes and active
 * markets from double-counting.
 */
export function refreshSeriesDay(
  asset: string,
  period: string,
  day: string,
): void {
  const dayStart = Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);
  if (!Number.isFinite(dayStart)) return;

  const db = getDb();
  db.prepare(
    "DELETE FROM series_days WHERE asset = ? AND period = ? AND day = ?",
  ).run(asset, period, day);

  db.prepare(
    `INSERT INTO series_days
       (asset, period, day, markets, resolved, samples, updated_at)
     SELECT m.asset, m.period, ?, COUNT(*),
            SUM(CASE WHEN m.resolved IN ('UP', 'DOWN') THEN 1 ELSE 0 END),
            SUM(COALESCE(ms.sample_count,
              (SELECT COUNT(*) FROM samples s WHERE s.slug = m.slug))),
            ?
     FROM markets m
     LEFT JOIN market_stats ms ON ms.slug = m.slug
     WHERE m.asset = ? AND m.period = ?
       AND m.start_epoch >= ? AND m.start_epoch < ?
     GROUP BY m.asset, m.period`,
  ).run(day, Math.floor(Date.now() / 1000), asset, period, dayStart, dayStart + 86_400);
}

export function finalizeMarketStats(
  slug: string,
  asset: string,
  period: string,
  startEpoch: number,
  endEpoch: number,
): MarketStatsRow {
  const stats = computeMarketStats(slug, startEpoch, endEpoch);
  storeMarketStats(stats);
  refreshSeriesDay(asset, period, utcDay(startEpoch));
  return stats;
}

/**
 * Refresh the last N UTC days for every known series. Used at collector
 * startup and during hourly maintenance as a safety net for missed finalize
 * events or late resolutions.
 */
export function refreshRecentSeriesDays(daysBack = 2): void {
  const db = getDb();
  const series = db
    .prepare("SELECT DISTINCT asset, period FROM markets")
    .all() as unknown as Array<{ asset: string; period: string }>;
  if (series.length === 0) return;

  const now = Math.floor(Date.now() / 1000);
  for (let offset = 0; offset < daysBack; offset += 1) {
    const day = utcDay(now - offset * 86_400);
    for (const item of series) {
      refreshSeriesDay(item.asset, item.period, day);
    }
  }
}

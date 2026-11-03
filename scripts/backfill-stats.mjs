#!/usr/bin/env node
/**
 * Backfill market_stats and series_days for an existing market database.
 *
 * Usage:
 *   node scripts/backfill-stats.mjs           # only markets missing stats
 *   node scripts/backfill-stats.mjs --all     # recompute every finished market
 *
 * The collector keeps these tables current for new data; this script is for
 * databases created before the rollups existed.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dbPath =
  process.env.POLY_DB_PATH?.trim() ||
  path.join(process.cwd(), "data", "live", "polyklines.sqlite");

if (!fs.existsSync(dbPath)) {
  console.error(`[backfill] database not found: ${dbPath}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");
db.exec("PRAGMA busy_timeout = 5000;");

db.exec(`
  CREATE TABLE IF NOT EXISTS series_days (
    asset TEXT NOT NULL,
    period TEXT NOT NULL,
    day TEXT NOT NULL,
    markets INTEGER NOT NULL,
    resolved INTEGER NOT NULL,
    samples INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (asset, period, day)
  ) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS market_stats (
    slug TEXT PRIMARY KEY,
    sample_count INTEGER NOT NULL,
    first_ts INTEGER,
    last_ts INTEGER,
    up_open REAL,
    up_high REAL,
    up_low REAL,
    up_close REAL,
    down_open REAL,
    down_high REAL,
    down_low REAL,
    down_close REAL,
    computed_at INTEGER NOT NULL
  );
`);

const up = "COALESCE(up_mid, up_last, (up_bid + up_ask) / 2.0)";
const down = "COALESCE(down_mid, down_last, (down_bid + down_ask) / 2.0)";
const now = Math.floor(Date.now() / 1000);
const recomputeAll = process.argv.includes("--all");

const markets = db
  .prepare(
    `SELECT m.slug, m.asset, m.period, m.start_epoch, m.end_epoch
     FROM markets m
     WHERE m.end_epoch < ?
       ${recomputeAll ? "" : "AND NOT EXISTS (SELECT 1 FROM market_stats ms WHERE ms.slug = m.slug)"}
     ORDER BY m.start_epoch`,
  )
  .all(now);

console.log(
  `[backfill] ${dbPath} :: ${markets.length} market(s) ${recomputeAll ? "to recompute" : "missing stats"}`,
);

const aggregateStmt = db.prepare(
  `SELECT COUNT(*) AS sample_count,
          MIN(ts) AS first_ts,
          MAX(ts) AS last_ts,
          MAX(${up}) AS up_high,
          MIN(${up}) AS up_low,
          MAX(${down}) AS down_high,
          MIN(${down}) AS down_low
   FROM samples
   WHERE slug = ? AND ts >= ? AND ts < ?`,
);

const edgeSql = `
  SELECT ${up} AS up_price, ${down} AS down_price
  FROM samples
  WHERE slug = ? AND ts >= ? AND ts < ?
    AND (${up} IS NOT NULL OR ${down} IS NOT NULL)
  ORDER BY ts`;
const firstStmt = db.prepare(`${edgeSql} LIMIT 1`);
const lastStmt = db.prepare(`${edgeSql} DESC LIMIT 1`);

const insertStmt = db.prepare(
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
);

let done = 0;
let batch = 0;
db.exec("BEGIN");
try {
  for (const market of markets) {
    const aggregate = aggregateStmt.get(
      market.slug,
      market.start_epoch,
      market.end_epoch,
    );
    const first = firstStmt.get(
      market.slug,
      market.start_epoch,
      market.end_epoch,
    );
    const last = lastStmt.get(
      market.slug,
      market.start_epoch,
      market.end_epoch,
    );

    insertStmt.run(
      market.slug,
      aggregate.sample_count,
      aggregate.first_ts,
      aggregate.last_ts,
      first?.up_price ?? null,
      aggregate.up_high,
      aggregate.up_low,
      last?.up_price ?? null,
      first?.down_price ?? null,
      aggregate.down_high,
      aggregate.down_low,
      last?.down_price ?? null,
      now,
    );

    done += 1;
    batch += 1;
    if (batch >= 500) {
      db.exec("COMMIT");
      db.exec("BEGIN");
      batch = 0;
      console.log(`[backfill] ${done}/${markets.length}`);
    }
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

console.log(`[backfill] market_stats done: ${done}`);

// Rebuild the small daily coverage table from scratch. This also picks up
// active markets via the sample-count fallback.
db.exec("DELETE FROM series_days");
db.prepare(
  `INSERT INTO series_days
     (asset, period, day, markets, resolved, samples, updated_at)
   SELECT m.asset,
          m.period,
          strftime('%Y-%m-%d', m.start_epoch, 'unixepoch') AS day,
          COUNT(*),
          SUM(CASE WHEN m.resolved IN ('UP', 'DOWN') THEN 1 ELSE 0 END),
          SUM(COALESCE(ms.sample_count,
            (SELECT COUNT(*) FROM samples s WHERE s.slug = m.slug))),
          ?
   FROM markets m
   LEFT JOIN market_stats ms ON ms.slug = m.slug
   GROUP BY m.asset, m.period, day`,
).run(now);

const coverage = db.prepare("SELECT COUNT(*) AS n FROM series_days").get();
console.log(`[backfill] series_days rows: ${coverage.n}`);
db.close();

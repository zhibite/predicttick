#!/usr/bin/env node
/**
 * Merge a historical PolyKlines market DB into the live market DB.
 *
 * - markets: INSERT OR IGNORE; fill missing resolved/title/token fields
 * - samples: INSERT OR IGNORE, so the destination wins on duplicate (slug, ts)
 * - stats.samples_total is updated
 * - series_days / market_stats are NOT merged; run backfill-stats.mjs --all after
 *
 * Usage:
 *   POLY_DB_PATH=/opt/polyklines/data/live/polyklines.sqlite \
 *     node scripts/merge-market-db.mjs /tmp/old-market.sqlite
 *
 * Stop the collector while this runs (the web can keep reading).
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const source = process.argv[2] ?? process.env.POLY_MERGE_SOURCE;
const target =
  process.env.POLY_DB_PATH?.trim() ||
  path.join(process.cwd(), "data", "live", "polyklines.sqlite");

if (!source || !fs.existsSync(source)) {
  console.error("Source database not found. Pass the path as the first argument.");
  process.exit(2);
}
if (!fs.existsSync(target)) {
  console.error(`Target database not found: ${target}`);
  process.exit(2);
}

function count(db, sql) {
  return Number(db.prepare(sql).get()?.c ?? 0);
}

const db = new DatabaseSync(target);
db.exec("PRAGMA busy_timeout = 15000;");
db.exec("PRAGMA foreign_keys = OFF;");

const sourcePath = source.replace(/'/g, "''");
db.exec(`ATTACH DATABASE '${sourcePath}' AS src`);

const beforeMarkets = count(db, "SELECT COUNT(*) AS c FROM markets");
const beforeSamples = count(db, "SELECT COUNT(*) AS c FROM samples");
const sourceMarkets = count(db, "SELECT COUNT(*) AS c FROM src.markets");
const sourceSamples = count(db, "SELECT COUNT(*) AS c FROM src.samples");

console.log(
  JSON.stringify(
    { target, source, beforeMarkets, beforeSamples, sourceMarkets, sourceSamples },
    null,
    2,
  ),
);

db.exec("BEGIN IMMEDIATE");
try {
  db.exec(`
    INSERT OR IGNORE INTO markets
      (slug, asset, period, start_epoch, end_epoch, condition_id,
       up_token, down_token, title, resolved, discovered_at, finalized_at)
    SELECT slug, asset, period, start_epoch, end_epoch, condition_id,
           up_token, down_token, title, resolved, discovered_at, finalized_at
    FROM src.markets
  `);

  db.exec(`
    INSERT OR IGNORE INTO samples
      (slug, ts, up_bid, up_ask, up_mid, up_last,
       down_bid, down_ask, down_mid, down_last)
    SELECT slug, ts, up_bid, up_ask, up_mid, up_last,
           down_bid, down_ask, down_mid, down_last
    FROM src.samples
  `);

  // Prefer the destination's resolution, but fill UNKNOWN rows from history.
  db.exec(`
    UPDATE markets SET resolved = (
      SELECT s.resolved FROM src.markets s
      WHERE s.slug = markets.slug
    )
    WHERE resolved NOT IN ('UP', 'DOWN')
      AND EXISTS (
        SELECT 1 FROM src.markets s
        WHERE s.slug = markets.slug AND s.resolved IN ('UP', 'DOWN')
      )
  `);

  // Fill missing metadata without overwriting live values.
  db.exec(`
    UPDATE markets SET
      title = COALESCE(NULLIF(title, ''), (
        SELECT NULLIF(s.title, '') FROM src.markets s WHERE s.slug = markets.slug
      )),
      condition_id = COALESCE(condition_id, (
        SELECT s.condition_id FROM src.markets s WHERE s.slug = markets.slug
      )),
      up_token = COALESCE(up_token, (
        SELECT s.up_token FROM src.markets s WHERE s.slug = markets.slug
      )),
      down_token = COALESCE(down_token, (
        SELECT s.down_token FROM src.markets s WHERE s.slug = markets.slug
      )),
      finalized_at = COALESCE(finalized_at, (
        SELECT s.finalized_at FROM src.markets s WHERE s.slug = markets.slug
      ))
    WHERE EXISTS (
      SELECT 1 FROM src.markets s WHERE s.slug = markets.slug
    )
  `);

  db.exec(`
    UPDATE stats SET samples_total = (SELECT COUNT(*) FROM samples)
    WHERE id = 1
  `);

  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  db.exec("DETACH DATABASE src");
  db.close();
  throw error;
}

db.exec("DETACH DATABASE src");
const afterMarkets = count(db, "SELECT COUNT(*) AS c FROM markets");
const afterSamples = count(db, "SELECT COUNT(*) AS c FROM samples");
db.close();

console.log(
  JSON.stringify(
    {
      insertedMarkets: afterMarkets - beforeMarkets,
      insertedSamples: afterSamples - beforeSamples,
      afterMarkets,
      afterSamples,
    },
    null,
    2,
  ),
);
console.log("Now run: node scripts/backfill-stats.mjs --all");

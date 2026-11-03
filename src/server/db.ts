import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

import { applyMigrations } from "./migrate";
import type { Migration } from "./migrate";

export const DB_PATH =
  process.env.POLY_DB_PATH?.trim() ||
  path.join(process.cwd(), "data", "live", "polyklines.sqlite");

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "market data baseline",
    sql: `
      CREATE TABLE IF NOT EXISTS markets (
        slug TEXT PRIMARY KEY,
        asset TEXT NOT NULL,
        period TEXT NOT NULL,
        start_epoch INTEGER NOT NULL,
        end_epoch INTEGER NOT NULL,
        condition_id TEXT,
        up_token TEXT,
        down_token TEXT,
        title TEXT,
        resolved TEXT NOT NULL DEFAULT 'UNKNOWN',
        discovered_at INTEGER NOT NULL,
        finalized_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_markets_series
        ON markets(asset, period, start_epoch);

      CREATE TABLE IF NOT EXISTS samples (
        slug TEXT NOT NULL,
        ts INTEGER NOT NULL,
        up_bid REAL,
        up_ask REAL,
        up_mid REAL,
        up_last REAL,
        down_bid REAL,
        down_ask REAL,
        down_mid REAL,
        down_last REAL,
        PRIMARY KEY (slug, ts)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        samples_total INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO stats (id, samples_total)
        SELECT 1, COUNT(*) FROM samples;

      CREATE TABLE IF NOT EXISTS collector_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        started_at INTEGER,
        heartbeat_at INTEGER,
        ws_connections INTEGER NOT NULL DEFAULT 0,
        active_markets INTEGER NOT NULL DEFAULT 0,
        messages_total INTEGER NOT NULL DEFAULT 0,
        samples_total INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
    `,
  },
  {
    version: 3,
    name: "future.news gap backfill",
    sql: `
      CREATE TABLE IF NOT EXISTS samples_backfill (
        slug TEXT NOT NULL,
        ts INTEGER NOT NULL,
        up_bid REAL,
        up_ask REAL,
        up_mid REAL,
        up_last REAL,
        down_bid REAL,
        down_ask REAL,
        down_mid REAL,
        down_last REAL,
        source TEXT NOT NULL DEFAULT 'future.news',
        fetched_at INTEGER NOT NULL,
        PRIMARY KEY (slug, ts)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS idx_samples_backfill_slug
        ON samples_backfill(slug, ts);

      CREATE VIEW IF NOT EXISTS samples_all AS
        SELECT slug, ts, up_bid, up_ask, up_mid, up_last,
               down_bid, down_ask, down_mid, down_last,
               'live' AS source
        FROM samples
        UNION ALL
        SELECT b.slug, b.ts, b.up_bid, b.up_ask, b.up_mid, b.up_last,
               b.down_bid, b.down_ask, b.down_mid, b.down_last,
               b.source
        FROM samples_backfill b
        WHERE NOT EXISTS (
          SELECT 1 FROM samples s
          WHERE s.slug = b.slug AND s.ts = b.ts
        );
    `,
  },
  {
    version: 2,
    name: "coverage rollups",
    sql: `
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

      CREATE INDEX IF NOT EXISTS idx_markets_series_resolved
        ON markets(asset, period, resolved, start_epoch);
    `,
  },
];

type GlobalWithDb = typeof globalThis & {
  __polyklinesDb?: DatabaseSync;
};

const globalStore = globalThis as GlobalWithDb;

export function getDb(): DatabaseSync {
  if (globalStore.__polyklinesDb) return globalStore.__polyklinesDb;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  applyMigrations(db, MIGRATIONS);
  globalStore.__polyklinesDb = db;
  return db;
}

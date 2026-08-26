/**
 * Generates a minimal local SQLite dataset for UI development.
 *
 * Output (written to D:\05.project2\10.polymarket\3.PredictTick\data\):
 *   - markets_<ts>.db  — 1 window per (asset, period)
 *   - btc_<ts>.db, eth_<ts>.db, ...  — klines (~82 rows per window, 2 windows per asset)
 *
 * Usage: `npx tsx scripts/seed-mock-db.ts`
 * Then override GMGN_DATA_DIR in dev:
 *   PowerShell: $env:GMGN_DATA_DIR = "$(Resolve-Path .\data)"
 *   bash:       export GMGN_DATA_DIR="$(pwd)/data"
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { ASSETS, PERIODS, PERIOD_SECONDS } from "../src/lib/db/constants";

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data");
fs.mkdirSync(OUT_DIR, { recursive: true });

const nowMs = Date.now();
const marketsPath = path.join(OUT_DIR, `markets_${nowMs}.db`);
const markets = new Database(marketsPath);
markets.pragma("journal_mode = WAL");
markets.exec(`
  CREATE TABLE markets (
    slug        TEXT PRIMARY KEY,
    asset       TEXT NOT NULL,
    period      TEXT NOT NULL,
    start_epoch INTEGER NOT NULL,
    end_epoch   INTEGER NOT NULL,
    up_token    TEXT,
    down_token  TEXT,
    status      TEXT NOT NULL,
    volume      REAL NOT NULL
  );
  CREATE INDEX idx_markets_asset_period ON markets(asset, period);
`);

type Tick = { t: number; p: number; v: number };

function buildSeries(startEpoch: number, durSec: number, side: "up" | "down"): Tick[] {
  const out: Tick[] = [];
  const durationMs = durSec * 1000;
  const steps = 40;
  const stepMs = durationMs / steps;
  for (let i = 0; i <= steps; i++) {
    const phase = i / steps;
    const swing = Math.sin(phase * Math.PI * 2) * 0.08;
    const baseUp = 0.52 + phase * 0.1 + swing;
    const baseDown = 0.48 - phase * 0.05 + swing * 0.6;
    const p = side === "up" ? clamp(baseUp, 0.05, 0.95) : clamp(baseDown, 0.05, 0.95);
    const v = 100 + Math.round(Math.abs(Math.cos(phase * Math.PI)) * 1500);
    out.push({ t: startEpoch * 1000 + Math.round(i * stepMs), p: round(p, 4), v });
  }
  return out;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
function round(x: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

let totalKlineRows = 0;
const insertMarket = markets.prepare(
  `INSERT INTO markets
     (slug, asset, period, start_epoch, end_epoch, up_token, down_token, status, volume)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const now = Math.floor(Date.now() / 1000);
const assetFiles: string[] = [];

// Per-asset DB: create table once, insert rows for all periods
for (const asset of ASSETS) {
  const assetPath = path.join(OUT_DIR, `${asset}_${nowMs}.db`);
  const db = new Database(assetPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE klines (
      token_id TEXT NOT NULL,
      slug     TEXT NOT NULL,
      time_ms  INTEGER NOT NULL,
      price    REAL NOT NULL,
      volume   REAL NOT NULL
    );
    CREATE INDEX idx_klines_token ON klines(token_id);
    CREATE INDEX idx_klines_slug  ON klines(slug);
  `);
  const insertKline = db.prepare(
    `INSERT INTO klines (token_id, slug, time_ms, price, volume) VALUES (?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction(
    (rows: Array<[token_id: string, slug: string, tick: Tick]>) => {
      for (const [token_id, slug, tick] of rows) {
        insertKline.run(token_id, slug, tick.t, tick.p, tick.v);
      }
    },
  );

  for (const period of PERIODS) {
    const dur = PERIOD_SECONDS[period];
    const startEpoch = now - dur;
    const endEpoch = startEpoch + dur;
    const upToken = `${asset}-up-${startEpoch}`;
    const downToken = `${asset}-down-${startEpoch}`;
    const slug = `${asset}-up-or-down-${period}-${startEpoch}`;
    const volume = 8000 + Math.round(Math.random() * 5000);

    insertMarket.run(
      slug,
      asset,
      period,
      startEpoch,
      endEpoch,
      upToken,
      downToken,
      "resolved",
      volume,
    );

    const upTicks = buildSeries(startEpoch, dur, "up");
    const dnTicks = buildSeries(startEpoch, dur, "down");
    const klineRows = [
      ...upTicks.map((tick): [string, string, Tick] => [upToken, slug, tick]),
      ...dnTicks.map((tick): [string, string, Tick] => [downToken, slug, tick]),
    ];
    tx(klineRows);
    totalKlineRows += klineRows.length;
  }

  db.close();
  assetFiles.push(path.basename(assetPath));
}

markets.close();

console.log(`✔ markets_<ts>.db -> ${marketsPath}`);
console.log(`✔ ${assetFiles.join(", ")} (${assetFiles.length} asset DBs)`);
console.log(`✔ klines total rows: ${totalKlineRows}`);
console.log("");
console.log("Override GMGN_DATA_DIR in dev:");
console.log('  $env:GMGN_DATA_DIR = "D:\\05.project2\\10.polymarket\\3.PredictTick\\data"');

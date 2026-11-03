#!/usr/bin/env node
/**
 * Fill missing collector samples from future.news 1s token klines.
 *
 * The collector owns `samples`. Backfilled rows go to `samples_backfill`
 * (source='future.news'); the `samples_all` view prefers live rows on overlap.
 * Backtests/exports keep using `samples`; charts and public candles use
 * `samples_all`.
 *
 * Usage:
 *   POLY_DB_PATH=data/live/polyklines.sqlite \
 *     npm run backfill:gaps -- --from=2026-11-03T00:20:00Z \
 *     --to=2026-11-03T01:10:00Z --assets=btc,eth --periods=5m,15m
 *
 * Optional:
 *   --dry-run              fetch/report but do not insert
 *   --max-markets=20       stop after N markets that need backfill
 *   --delay-ms=3000        pause between future.news requests
 *   --min-gap=1            only process markets with at least N missing samples
 */
import { DatabaseSync } from "node:sqlite";

const INTERVALS = { "5m": 1, "15m": 5, "1h": 10, "4h": 30 };
const ALL_ASSETS = ["btc", "eth", "bnb", "sol", "doge", "xrp", "hype"];
const ALL_PERIODS = Object.keys(INTERVALS);
const FUTURE_NEWS = "https://future.news/api/v1/token_kline/polymarket";

function usage() {
  console.log(`Usage: npm run backfill:gaps -- [options]

  --from=ISO             window start (default: 24h ago)
  --to=ISO               window end (default: now)
  --assets=a,b           comma separated (default: all)
  --periods=5m,15m       comma separated (default: all)
  --min-gap=N            minimum missing samples to process (default: 1)
  --max-markets=N        stop after N markets that need data (default: all)
  --delay-ms=N           delay between future.news requests (default: 3000)
  --dry-run              fetch and report, do not write
  --help                 show this help
`);
}

function parseArgs(argv) {
  const out = {
    from: new Date(Date.now() - 86_400_000),
    to: new Date(),
    assets: [...ALL_ASSETS],
    periods: [...ALL_PERIODS],
    minGap: 1,
    maxMarkets: Number.POSITIVE_INFINITY,
    delayMs: 3_000,
    dryRun: false,
  };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    const match = arg.match(/^--([a-z-]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (key === "from") out.from = new Date(value);
    else if (key === "to") out.to = new Date(value);
    else if (key === "assets") out.assets = value.split(",").filter(Boolean);
    else if (key === "periods") out.periods = value.split(",").filter(Boolean);
    else if (key === "min-gap") out.minGap = Number(value);
    else if (key === "max-markets") out.maxMarkets = Number(value);
    else if (key === "delay-ms") out.delayMs = Number(value);
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 && price <= 1 ? price : null;
}

function ensureSchema(db) {
  db.exec(`
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
  `);
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

const cookieJar = new Map();

function cookieHeader() {
  return [...cookieJar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function captureCookies(response) {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  for (const value of setCookies) {
    const pair = value.split(";")[0];
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    cookieJar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

/**
 * future.news puts a Cloudflare managed challenge in front of bursty API
 * calls. A normal browser page visit returns a short-lived __cf_bm cookie;
 * reuse it and refresh on 403 instead of hammering the API.
 */
async function warmUpCookies() {
  try {
    const response = await fetch("https://future.news/trending", {
      headers: {
        ...BROWSER_HEADERS,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });
    captureCookies(response);
    await response.text();
    return response.status;
  } catch {
    return null;
  }
}

async function fetchFutureNews(token, period, slug) {
  const url = `${FUTURE_NEWS}/${encodeURIComponent(token)}?period=${encodeURIComponent(period)}`;

  let lastStatus = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          ...BROWSER_HEADERS,
          Referer: `https://future.news/event/${slug}`,
          Origin: "https://future.news",
          ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
        },
        signal: AbortSignal.timeout(25_000),
      });
      lastStatus = response.status;
      if (response.ok) {
        captureCookies(response);
        const body = await response.json();
        if (body?.code === 0 && Array.isArray(body.data?.list)) {
          return body.data.list;
        }
        return [];
      }
      if (
        response.status === 403 ||
        response.status === 429 ||
        response.status >= 500
      ) {
        await warmUpCookies();
        await sleep(5_000 * (attempt + 1) ** 2);
        continue;
      }
      return [];
    } catch {
      await warmUpCookies();
      await sleep(5_000 * (attempt + 1) ** 2);
    }
  }
  throw new Error(
    `future.news request failed after retries (last status ${lastStatus ?? "network"})`,
  );
}

/** Find the best integer-second timestamp offset using overlapping live mids. */
function bestShift(points, locals) {
  if (points.size === 0 || locals.length < 20) {
    return { shift: 0, mae: null, n: 0 };
  }
  let best = { shift: 0, mae: Number.POSITIVE_INFINITY, n: 0 };
  for (let shift = -150; shift <= 150; shift += 1) {
    let sum = 0;
    let n = 0;
    for (const row of locals) {
      const price = points.get(row.ts - shift);
      if (price == null) continue;
      sum += Math.abs(price - row.up_mid);
      n += 1;
    }
    if (n >= 20 && sum / n < best.mae) {
      best = { shift, mae: sum / n, n };
    }
  }
  if (!Number.isFinite(best.mae) || best.mae > 0.08) {
    return { shift: 0, mae: best.mae, n: best.n };
  }
  return best;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (Number.isNaN(options.from.getTime()) || Number.isNaN(options.to.getTime())) {
    console.error("Invalid --from/--to date.");
    process.exit(2);
  }
  const from = Math.floor(options.from.getTime() / 1000);
  const to = Math.floor(options.to.getTime() / 1000);
  if (from >= to) {
    console.error("--from must be before --to.");
    process.exit(2);
  }

  const dbPath =
    process.env.POLY_DB_PATH ||
    new URL("../data/live/polyklines.sqlite", import.meta.url).pathname;
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout = 10000;");
  ensureSchema(db);

  // future.news returns 403 to direct API bursts; start from a browser-like
  // page visit so the API calls carry a __cf_bm cookie.
  const warmStatus = await warmUpCookies();
  console.log(`future.news warm-up status: ${warmStatus ?? "failed"}`);

  const placeholders = (values) => values.map(() => "?").join(",");
  const markets = db
    .prepare(
      `SELECT slug, asset, period, start_epoch, end_epoch, up_token
       FROM markets
       WHERE end_epoch >= ? AND start_epoch <= ?
         AND asset IN (${placeholders(options.assets)})
         AND period IN (${placeholders(options.periods)})
       ORDER BY start_epoch ASC, asset ASC`,
    )
    .all(from, to, ...options.assets, ...options.periods);

  const existingStmt = db.prepare(
    "SELECT ts FROM samples WHERE slug = ? ORDER BY ts",
  );
  const localStmt = db.prepare(
    "SELECT ts, up_mid FROM samples WHERE slug = ? AND up_mid IS NOT NULL ORDER BY ts",
  );
  const insert = db.prepare(
    `INSERT OR IGNORE INTO samples_backfill
       (slug, ts, up_bid, up_ask, up_mid, up_last,
        down_bid, down_ask, down_mid, down_last, source, fetched_at)
     VALUES (?, ?, NULL, NULL, ?, ?, NULL, NULL, ?, ?, 'future.news', ?)`,
  );

  const summary = {
    markets: 0,
    marketsWithGaps: 0,
    marketsProcessed: 0,
    fetched: 0,
    inserted: 0,
    stillMissing: 0,
    skippedNoToken: 0,
    skippedNoData: 0,
    failed: 0,
    dryRun: options.dryRun,
    byPeriod: {},
    shifts: {},
  };
  let consecutiveFailures = 0;

  for (const market of markets) {
    const interval = INTERVALS[market.period];
    if (!interval) continue;
    summary.markets += 1;

    const existing = new Set(
      existingStmt.all(market.slug).map((row) => Number(row.ts)),
    );
    const missing = [];
    for (
      let ts = Number(market.start_epoch);
      ts < Number(market.end_epoch);
      ts += interval
    ) {
      if (!existing.has(ts)) missing.push(ts);
    }
    if (missing.length < options.minGap) continue;
    summary.marketsWithGaps += 1;
    if (summary.marketsProcessed >= options.maxMarkets) continue;
    summary.marketsProcessed += 1;

    if (!market.up_token) {
      summary.skippedNoToken += 1;
      continue;
    }

    try {
      const list = await fetchFutureNews(
        market.up_token,
        market.period,
        market.slug,
      );
      consecutiveFailures = 0;
      if (list.length === 0) {
        summary.skippedNoData += 1;
        continue;
      }

      const points = new Map();
      for (const item of list) {
        const price = parsePrice(item.price);
        if (price == null) continue;
        const ts = Math.floor(Number(item.time) / 1000);
        if (Number.isFinite(ts)) points.set(ts, price);
      }
      const locals = localStmt
        .all(market.slug)
        .map((row) => ({ ts: Number(row.ts), up_mid: Number(row.up_mid) }))
        .filter((row) => Number.isFinite(row.up_mid));
      const alignment = bestShift(points, locals);
      summary.shifts[String(alignment.shift)] =
        (summary.shifts[String(alignment.shift)] ?? 0) + 1;

      let filled = 0;
      const fetchedAt = Math.floor(Date.now() / 1000);
      if (!options.dryRun) {
        db.exec("BEGIN IMMEDIATE");
      }
      try {
        for (const ts of missing) {
          const price = points.get(ts - alignment.shift);
          if (price == null) continue;
          const down = Math.max(0, Math.min(1, 1 - price));
          if (!options.dryRun) {
            insert.run(
              market.slug,
              ts,
              price,
              price,
              down,
              down,
              fetchedAt,
            );
          }
          filled += 1;
        }
        if (!options.dryRun) db.exec("COMMIT");
      } catch (error) {
        if (!options.dryRun) db.exec("ROLLBACK");
        throw error;
      }

      summary.fetched += 1;
      summary.inserted += filled;
      summary.stillMissing += missing.length - filled;
      const bucket = (summary.byPeriod[market.period] ??= {
        markets: 0,
        inserted: 0,
        stillMissing: 0,
      });
      bucket.markets += 1;
      bucket.inserted += filled;
      bucket.stillMissing += missing.length - filled;
      console.log(
        `${market.slug} ${market.asset}/${market.period}: missing=${missing.length} filled=${filled} remaining=${missing.length - filled} shift=${alignment.shift}s mae=${alignment.mae == null ? "—" : alignment.mae.toFixed(4)}`,
      );
    } catch (error) {
      summary.failed += 1;
      consecutiveFailures += 1;
      console.error(
        `${market.slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (consecutiveFailures >= 3) {
        console.error(
          "future.news appears rate-limited/blocked (3 consecutive failures). Stopping; rerun later with a larger --delay-ms.",
        );
        break;
      }
    }

    await sleep(options.delayMs + Math.floor(Math.random() * 750));
  }

  db.close();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { getDb } from "./db";
import {
  finalizeMarketStats,
  refreshRecentSeriesDays,
  refreshSeriesDay,
  utcDay,
} from "./query/aggregates";
import type { Period } from "@/lib/types";

/**
 * Live Polymarket collector.
 *
 * Runs once per Next.js server process (started from instrumentation.ts).
 * For every tracked asset it discovers the current 5m/15m/1h/4h markets
 * through the Gamma API, subscribes both outcome tokens on the CLOB
 * WebSocket, and writes best-bid/ask snapshots at the configured interval.
 */

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

const ASSETS = (process.env.POLY_ASSETS ?? "btc,eth,bnb,sol,doge,xrp,hype")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const SAMPLE_15M_SECONDS = Math.min(
  60,
  positiveInt(process.env.POLY_15M_SAMPLE_SECONDS, 5),
);
const SAMPLE_1H_SECONDS = Math.min(
  120,
  positiveInt(process.env.POLY_1H_SAMPLE_SECONDS, 10),
);
const SAMPLE_4H_SECONDS = Math.min(
  300,
  positiveInt(process.env.POLY_4H_SAMPLE_SECONDS, 30),
);
const RETENTION_DAYS = positiveInt(process.env.POLY_RETENTION_DAYS, 180);

interface PeriodDef {
  period: Period;
  step: number;
  sampleEvery: number;
  lookahead: number;
  kind: "short" | "hourly";
}

const PERIODS: PeriodDef[] = [
  { period: "5m", step: 300, sampleEvery: 1, lookahead: 120, kind: "short" },
  {
    period: "15m",
    step: 900,
    sampleEvery: SAMPLE_15M_SECONDS,
    lookahead: 120,
    kind: "short",
  },
  {
    period: "1h",
    step: 3_600,
    sampleEvery: SAMPLE_1H_SECONDS,
    lookahead: 60,
    kind: "hourly",
  },
  {
    period: "4h",
    step: 14_400,
    sampleEvery: SAMPLE_4H_SECONDS,
    lookahead: 60,
    kind: "short",
  },
];

// 1h markets use full names in their slug / series: bitcoin-up-or-down-...
const HOURLY_SERIES_NAMES: Record<string, string> = {
  btc: "bitcoin",
  eth: "ethereum",
  bnb: "bnb",
  sol: "solana",
  doge: "dogecoin",
  xrp: "xrp",
  hype: "hype",
};

const DISCOVERY_INTERVAL_MS = 5_000;
const LOOKUP_COOLDOWN_SECONDS = 10;
const HOURLY_LOOKUP_COOLDOWN_SECONDS = 30;

interface Bbo {
  bid: number | null;
  ask: number | null;
  last: number | null;
}

interface MarketDef {
  slug: string;
  asset: string;
  period: Period;
  start: number;
  end: number;
  sampleEvery: number;
  conditionId: string | null;
  upToken: string;
  downToken: string;
  title: string;
}

interface ActiveMarket extends MarketDef {
  bboUp: Bbo;
  bboDown: Bbo;
  ws: WebSocket | null;
  connected: boolean;
  closed: boolean;
  pingTimer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
}

type GlobalWithCollector = typeof globalThis & {
  __polyklinesCollector?: { startedAt: number };
};

const globalStore = globalThis as GlobalWithCollector;

const active = new Map<string, ActiveMarket>();
const finalized = new Set<string>();
const lookupCooldown = new Map<string, number>();
const hourlyCooldown = new Map<string, number>();

const db = getDb();
const insertMarket = db.prepare(`
  INSERT INTO markets (
    slug, asset, period, start_epoch, end_epoch, condition_id,
    up_token, down_token, title, resolved, discovered_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNKNOWN', ?)
  ON CONFLICT(slug) DO UPDATE SET
    condition_id = excluded.condition_id,
    up_token = excluded.up_token,
    down_token = excluded.down_token,
    title = excluded.title
`);
const insertSample = db.prepare(`
  INSERT OR IGNORE INTO samples (
    slug, ts, up_bid, up_ask, up_mid, up_last,
    down_bid, down_ask, down_mid, down_last
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const bumpSamples = db.prepare(
  "UPDATE stats SET samples_total = samples_total + ? WHERE id = 1",
);
const upsertStatus = db.prepare(`
  INSERT INTO collector_status (
    id, started_at, heartbeat_at, ws_connections, active_markets,
    messages_total, samples_total, last_error
  ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    started_at = excluded.started_at,
    heartbeat_at = excluded.heartbeat_at,
    ws_connections = excluded.ws_connections,
    active_markets = excluded.active_markets,
    messages_total = excluded.messages_total,
    samples_total = excluded.samples_total,
    last_error = excluded.last_error
`);

const startedAt = Math.floor(Date.now() / 1000);
let messagesTotal = 0;
let samplesTotal = 0;
let lastError: string | null = null;
let lastCleanup = 0;

function noteError(error: unknown): void {
  lastError = error instanceof Error ? error.message : String(error);
  console.error("[collector]", lastError);
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {
      return [];
    }
  }
  return [];
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function midpoint(bbo: Bbo): number | null {
  if (bbo.bid == null || bbo.ask == null) return null;
  return (bbo.bid + bbo.ask) / 2;
}

async function fetchGammaEvent(slug: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(
    `${GAMMA_BASE}/events?slug=${encodeURIComponent(slug)}`,
    {
      headers: {
        "User-Agent": "PolyKlines/1.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const event = payload[0];
  return event && typeof event === "object"
    ? (event as Record<string, unknown>)
    : null;
}

function marketDefFromEvent(
  asset: string,
  def: PeriodDef,
  start: number,
  end: number,
  slug: string,
  event: Record<string, unknown>,
): MarketDef | null {
  const markets = Array.isArray(event.markets) ? event.markets : [];
  const market = markets[0];
  if (!market || typeof market !== "object") return null;
  const info = market as Record<string, unknown>;

  const tokens = parseStringArray(info.clobTokenIds);
  const outcomes = parseStringArray(info.outcomes);
  if (tokens.length < 2) return null;

  let upToken = tokens[0];
  let downToken = tokens[1];
  const upIndex = outcomes.findIndex(
    (label) => label.trim().toLowerCase() === "up",
  );
  const downIndex = outcomes.findIndex(
    (label) => label.trim().toLowerCase() === "down",
  );
  if (upIndex >= 0 && downIndex >= 0 && tokens[upIndex] && tokens[downIndex]) {
    upToken = tokens[upIndex];
    downToken = tokens[downIndex];
  }

  return {
    slug,
    asset,
    period: def.period,
    start,
    end,
    sampleEvery: def.sampleEvery,
    conditionId:
      typeof info.conditionId === "string" ? info.conditionId : null,
    upToken,
    downToken,
    title:
      (typeof event.title === "string" && event.title) ||
      (typeof info.question === "string" && info.question) ||
      slug,
  };
}

async function fetchMarketDef(
  asset: string,
  def: PeriodDef,
  start: number,
): Promise<MarketDef | null> {
  const slug = `${asset}-updown-${def.period}-${start}`;
  const event = await fetchGammaEvent(slug);
  if (!event) return null;
  return marketDefFromEvent(
    asset,
    def,
    start,
    start + def.step,
    slug,
    event,
  );
}

async function fetchGammaSeries(
  seriesSlug: string,
  closedOnly: boolean,
): Promise<Array<Record<string, unknown>>> {
  const suffix = closedOnly ? "&closed=false" : "";
  const response = await fetch(
    `${GAMMA_BASE}/events?series_slug=${encodeURIComponent(seriesSlug)}&limit=10${suffix}`,
    {
      headers: {
        "User-Agent": "PolyKlines/1.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) return [];
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) return [];
  return payload.filter(
    (event): event is Record<string, unknown> =>
      Boolean(event) && typeof event === "object",
  );
}

const ET_PARTS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Seconds to add to a UTC timestamp to get the current ET wall-clock epoch. */
function etOffsetSeconds(nowSeconds: number): number {
  const parts = ET_PARTS_FORMAT.formatToParts(new Date(nowSeconds * 1000));
  const get = (type: string): number => {
    const part = parts.find((item) => item.type === type);
    return Number(part?.value ?? "0");
  };
  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((wallAsUtc - nowSeconds * 1000) / 1000);
}

/** Current 4h window start (UTC epoch), aligned to 00/04/08/12/16/20 ET. */
function fourHourStart(nowSeconds: number): number {
  const offset = etOffsetSeconds(nowSeconds);
  const etNow = nowSeconds + offset;
  const etStart = Math.floor(etNow / 14_400) * 14_400;
  return etStart - offset;
}

async function discoverHourly(
  asset: string,
  def: PeriodDef,
  now: number,
): Promise<void> {
  const lastAttempt = hourlyCooldown.get(asset) ?? 0;
  if (now - lastAttempt < HOURLY_LOOKUP_COOLDOWN_SECONDS) return;
  hourlyCooldown.set(asset, now);

  // Most assets use the short series name (btc-, eth-, doge-), while the
  // long-form event slug uses the full name. SOL is the exception: its series
  // is solana-up-or-down-hourly. Try the short name first, then the full name.
  const fullName = HOURLY_SERIES_NAMES[asset] ?? asset;
  const seriesSlugs = [`${asset}-up-or-down-hourly`];
  if (fullName !== asset) seriesSlugs.push(`${fullName}-up-or-down-hourly`);

  let events: Array<Record<string, unknown>> = [];
  for (const seriesSlug of seriesSlugs) {
    events = await fetchGammaSeries(seriesSlug, true);
    if (events.length === 0) events = await fetchGammaSeries(seriesSlug, false);
    if (events.length > 0) break;
  }

  const candidates: MarketDef[] = [];
  for (const event of events) {
    const slug = typeof event.slug === "string" ? event.slug : "";
    const endMs = Date.parse(String(event.endDate ?? ""));
    if (!slug || !Number.isFinite(endMs)) continue;
    const end = Math.floor(endMs / 1000);
    if (end <= now) continue;
    const start = end - def.step;
    const market = marketDefFromEvent(asset, def, start, end, slug, event);
    if (market) candidates.push(market);
  }

  const current = candidates.find(
    (market) => market.start <= now && now < market.end,
  );
  const next = candidates
    .filter((market) => market.start > now)
    .sort((a, b) => a.start - b.start)[0];

  for (const market of [current, next]) {
    if (!market) continue;
    if (market.start > now + def.lookahead) continue;
    if (active.has(market.slug) || finalized.has(market.slug)) continue;
    registerMarket(market);
  }
}

function applyBook(message: Record<string, unknown>, bbo: Bbo): void {
  const bids = Array.isArray(message.bids) ? message.bids : [];
  const asks = Array.isArray(message.asks) ? message.asks : [];
  let bestBid: number | null = null;
  let bestAsk: number | null = null;
  for (const level of bids) {
    if (!level || typeof level !== "object") continue;
    const price = toNumber((level as Record<string, unknown>).price);
    if (price != null && (bestBid == null || price > bestBid)) bestBid = price;
  }
  for (const level of asks) {
    if (!level || typeof level !== "object") continue;
    const price = toNumber((level as Record<string, unknown>).price);
    if (price != null && (bestAsk == null || price < bestAsk)) bestAsk = price;
  }
  if (bestBid != null) bbo.bid = bestBid;
  if (bestAsk != null) bbo.ask = bestAsk;
}

function bboFor(market: ActiveMarket, assetId: string): Bbo | null {
  if (assetId === market.upToken) return market.bboUp;
  if (assetId === market.downToken) return market.bboDown;
  return null;
}

function handleSocketMessage(market: ActiveMarket, raw: string): void {
  if (!raw || raw === "PONG") return;
  messagesTotal += 1;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const messages = Array.isArray(parsed) ? parsed : [parsed];

  for (const item of messages) {
    if (!item || typeof item !== "object") continue;
    const message = item as Record<string, unknown>;
    const type = message.event_type;

    if (type === "book") {
      const bbo = bboFor(market, String(message.asset_id ?? ""));
      if (bbo) applyBook(message, bbo);
      continue;
    }

    if (type === "price_change") {
      const changes = Array.isArray(message.price_changes)
        ? message.price_changes
        : [];
      for (const change of changes) {
        if (!change || typeof change !== "object") continue;
        const entry = change as Record<string, unknown>;
        const bbo = bboFor(market, String(entry.asset_id ?? ""));
        if (!bbo) continue;
        const bid = toNumber(entry.best_bid);
        const ask = toNumber(entry.best_ask);
        if (bid != null) bbo.bid = bid;
        if (ask != null) bbo.ask = ask;
      }
      continue;
    }

    if (type === "last_trade_price") {
      const bbo = bboFor(market, String(message.asset_id ?? ""));
      const price = toNumber(message.price);
      if (bbo && price != null) bbo.last = price;
    }
  }
}

function scheduleReconnect(market: ActiveMarket): void {
  if (market.closed || market.reconnectTimer) return;
  const attempt = market.reconnectAttempts++;
  const delay = Math.min(30_000, 2_000 * 2 ** attempt) + Math.random() * 500;
  market.reconnectTimer = setTimeout(() => {
    market.reconnectTimer = null;
    if (!market.closed) connectMarket(market);
  }, delay);
}

function connectMarket(market: ActiveMarket): void {
  if (market.closed) return;

  const ws = new WebSocket(WS_URL);
  market.ws = ws;

  ws.onopen = () => {
    market.connected = true;
    market.reconnectAttempts = 0;
    ws.send(
      JSON.stringify({
        assets_ids: [market.upToken, market.downToken],
        type: "market",
      }),
    );
    market.pingTimer = setInterval(() => {
      try {
        ws.send("PING");
      } catch {
        // ignore
      }
    }, 10_000);
  };

  ws.onmessage = (event) => {
    if (typeof event.data === "string") {
      handleSocketMessage(market, event.data);
    }
  };

  ws.onerror = () => {
    // A close event follows; reconnect is handled there.
  };

  ws.onclose = () => {
    market.connected = false;
    if (market.pingTimer) {
      clearInterval(market.pingTimer);
      market.pingTimer = null;
    }
    if (!market.closed) scheduleReconnect(market);
  };
}

function registerMarket(def: MarketDef): void {
  const market: ActiveMarket = {
    ...def,
    bboUp: { bid: null, ask: null, last: null },
    bboDown: { bid: null, ask: null, last: null },
    ws: null,
    connected: false,
    closed: false,
    pingTimer: null,
    reconnectTimer: null,
    reconnectAttempts: 0,
  };

  insertMarket.run(
    def.slug,
    def.asset,
    def.period,
    def.start,
    def.end,
    def.conditionId,
    def.upToken,
    def.downToken,
    def.title,
    Math.floor(Date.now() / 1000),
  );
  active.set(def.slug, market);
  connectMarket(market);
  console.log(
    `[collector] tracking ${def.slug} (${def.period}, ${def.title})`,
  );
}

async function resolveOutcome(slug: string): Promise<"UP" | "DOWN" | "UNKNOWN"> {
  try {
    const event = await fetchGammaEvent(slug);
    if (!event) return "UNKNOWN";
    const markets = Array.isArray(event.markets) ? event.markets : [];
    const market = markets[0];
    if (!market || typeof market !== "object") return "UNKNOWN";
    const info = market as Record<string, unknown>;
    const outcomes = parseStringArray(info.outcomes).map((label) =>
      label.trim().toLowerCase(),
    );
    const prices = parseStringArray(info.outcomePrices).map((price) =>
      Number(price),
    );
    const upIndex = outcomes.indexOf("up");
    const downIndex = outcomes.indexOf("down");
    if (upIndex >= 0 && prices[upIndex] >= 0.99) return "UP";
    if (downIndex >= 0 && prices[downIndex] >= 0.99) return "DOWN";
  } catch (error) {
    noteError(error);
  }
  return "UNKNOWN";
}

const resolutionTimers = new Map<string, ReturnType<typeof setTimeout>>();

function updateResolved(slug: string, resolved: string): void {
  const previous = db
    .prepare(
      "SELECT asset, period, start_epoch, resolved FROM markets WHERE slug = ?",
    )
    .get(slug) as unknown as
    | {
        asset: string;
        period: string;
        start_epoch: number;
        resolved: string | null;
      }
    | undefined;

  db.prepare(
    "UPDATE markets SET resolved = ?, finalized_at = ? WHERE slug = ?",
  ).run(resolved, Math.floor(Date.now() / 1000), slug);

  // A market can settle after it was finalized as UNKNOWN. Refresh its UTC
  // day so coverage/resolution counts do not stay stale.
  if (
    previous &&
    previous.resolved === "UNKNOWN" &&
    (resolved === "UP" || resolved === "DOWN")
  ) {
    try {
      refreshSeriesDay(
        previous.asset,
        previous.period,
        utcDay(previous.start_epoch),
      );
    } catch (error) {
      noteError(error);
    }
  }
}

/**
 * Gamma often keeps a market "open" for a while after the window closes and
 * only then settles its outcome prices. Retry the outcome lookup with backoff
 * so rows converge from UNKNOWN to UP/DOWN.
 */
function scheduleResolution(slug: string, attempt: number): void {
  if (resolutionTimers.has(slug)) return;
  const delay =
    attempt === 0
      ? 15_000
      : Math.min(300_000, 30_000 * 2 ** (attempt - 1));
  const timer = setTimeout(async () => {
    resolutionTimers.delete(slug);
    const resolved = await resolveOutcome(slug);
    if (resolved !== "UNKNOWN") {
      updateResolved(slug, resolved);
      console.log(`[collector] resolved late ${slug}: ${resolved}`);
    } else if (attempt < 8) {
      scheduleResolution(slug, attempt + 1);
    }
  }, delay);
  resolutionTimers.set(slug, timer);
}

async function reconcileUnresolved(): Promise<void> {
  const rows = db
    .prepare(
      `SELECT m.slug FROM markets m
       WHERE m.resolved = 'UNKNOWN' AND m.end_epoch < ?
         AND EXISTS (SELECT 1 FROM samples s WHERE s.slug = m.slug)
       ORDER BY m.end_epoch DESC
       LIMIT 200`,
    )
    .all(Math.floor(Date.now() / 1000)) as unknown as Array<{ slug: string }>;
  if (rows.length === 0) return;
  console.log(`[collector] reconciling ${rows.length} unresolved markets`);
  rows.forEach((row, index) => {
    setTimeout(() => scheduleResolution(row.slug, 0), index * 250);
  });
}

async function finalizeMarket(market: ActiveMarket): Promise<void> {
  if (market.closed) return;
  market.closed = true;

  if (market.ws) {
    try {
      market.ws.close();
    } catch {
      // ignore
    }
  }
  if (market.pingTimer) clearInterval(market.pingTimer);
  if (market.reconnectTimer) clearTimeout(market.reconnectTimer);
  market.pingTimer = null;
  market.reconnectTimer = null;

  const resolved = await resolveOutcome(market.slug);
  updateResolved(market.slug, resolved);
  if (resolved === "UNKNOWN") scheduleResolution(market.slug, 1);

  try {
    finalizeMarketStats(
      market.slug,
      market.asset,
      market.period,
      market.start,
      market.end,
    );
  } catch (error) {
    noteError(error);
  }

  active.delete(market.slug);
  finalized.add(market.slug);
  console.log(`[collector] finalized ${market.slug}: ${resolved}`);
}

async function discoveryLoop(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  for (const asset of ASSETS) {
    for (const def of PERIODS) {
      if (def.kind === "hourly") {
        try {
          await discoverHourly(asset, def, now);
        } catch (error) {
          noteError(error);
        }
        continue;
      }

      const currentStart =
        def.period === "4h"
          ? fourHourStart(now)
          : Math.floor(now / def.step) * def.step;
      const starts = [currentStart];
      if (now >= currentStart + def.step - def.lookahead) {
        starts.push(currentStart + def.step);
      }

      for (const start of starts) {
        const slug = `${asset}-updown-${def.period}-${start}`;
        if (active.has(slug) || finalized.has(slug)) continue;
        const nextAttempt = lookupCooldown.get(slug) ?? 0;
        if (now < nextAttempt) continue;
        lookupCooldown.set(slug, now + LOOKUP_COOLDOWN_SECONDS);

        try {
          const defn = await fetchMarketDef(asset, def, start);
          if (defn) registerMarket(defn);
        } catch (error) {
          noteError(error);
        }
      }
    }
  }

  for (const market of active.values()) {
    if (now > market.end + 10 && !market.closed) {
      void finalizeMarket(market);
    }
  }

  if (now - lastCleanup > 3_600) {
    lastCleanup = now;
    try {
      const cutoff = now - RETENTION_DAYS * 86_400;
      const deleted = db.prepare("DELETE FROM samples WHERE ts < ?").run(cutoff);
      bumpSamples.run(-Number(deleted.changes));
      db.prepare(
        `DELETE FROM markets
         WHERE end_epoch < ?
           AND NOT EXISTS (SELECT 1 FROM samples s WHERE s.slug = markets.slug)`,
      ).run(cutoff);
      db.exec("PRAGMA wal_checkpoint(PASSIVE);");
      refreshRecentSeriesDays(2);
    } catch (error) {
      noteError(error);
    }
  }
}

function sampleTick(): void {
  const now = Math.floor(Date.now() / 1000);
  const rows: Array<Array<string | number | null>> = [];

  for (const market of active.values()) {
    if (now < market.start || now >= market.end) continue;
    if ((now - market.start) % market.sampleEvery !== 0) continue;

    const up = market.bboUp;
    const down = market.bboDown;
    rows.push([
      market.slug,
      now,
      up.bid,
      up.ask,
      midpoint(up),
      up.last,
      down.bid,
      down.ask,
      midpoint(down),
      down.last,
    ]);
  }

  if (rows.length > 0) {
    db.exec("BEGIN");
    try {
      let inserted = 0;
      for (const row of rows) {
        const result = insertSample.run(...row);
        inserted += Number(result.changes);
      }
      if (inserted > 0) bumpSamples.run(inserted);
      db.exec("COMMIT");
      samplesTotal += inserted;
    } catch (error) {
      db.exec("ROLLBACK");
      noteError(error);
    }
  }

  if (now % 5 === 0) {
    const connected = [...active.values()].filter(
      (market) => market.connected,
    ).length;
    try {
      upsertStatus.run(
        startedAt,
        now,
        connected,
        active.size,
        messagesTotal,
        samplesTotal,
        lastError,
      );
    } catch (error) {
      noteError(error);
    }
  }
}

function scheduleSampleTick(): void {
  const delay = 1_000 - (Date.now() % 1_000) + 5;
  setTimeout(() => {
    try {
      sampleTick();
    } catch (error) {
      noteError(error);
    }
    scheduleSampleTick();
  }, delay);
}

export function startCollector(): void {
  if (globalStore.__polyklinesCollector) return;
  globalStore.__polyklinesCollector = { startedAt: Date.now() };

  console.log(
    `[collector] starting: assets=${ASSETS.join(",")} ` +
      `15m_sample=${SAMPLE_15M_SECONDS}s retention=${RETENTION_DAYS}d`,
  );

  scheduleSampleTick();
  void reconcileUnresolved();
  try {
    refreshRecentSeriesDays(2);
  } catch (error) {
    noteError(error);
  }

  const runDiscovery = async (): Promise<void> => {
    try {
      await discoveryLoop();
    } catch (error) {
      noteError(error);
    } finally {
      setTimeout(() => void runDiscovery(), DISCOVERY_INTERVAL_MS);
    }
  };
  void runDiscovery();
}

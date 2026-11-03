import { getDb } from "../db";
import { updatePaperFillMarkouts } from "./markout";
import {
  getLastPaperEntryAt,
  getOpenPaperPositions,
  getPaperMarketCost,
  getPaperOpenCost,
  getPaperStrategySummary,
  hasPaperMarketActivity,
  listPaperStrategies,
  markPaperPosition,
  normalizePaperConfig,
  recordPaperBuy,
  recordPaperEquity,
  settlePaperPosition,
  updatePaperStrategyTick,
} from "./store";
import type {
  PaperStrategyConfig,
  PaperStrategySummary,
  PaperTickResult,
} from "./types";

interface MarketRow {
  slug: string;
  asset: string;
  period: string;
  start_epoch: number;
  end_epoch: number;
  title: string | null;
  resolved: string;
}

interface SampleRow {
  ts: number;
  up_bid: number | null;
  up_ask: number | null;
  up_mid: number | null;
  up_last: number | null;
  down_bid: number | null;
  down_ask: number | null;
  down_mid: number | null;
  down_last: number | null;
}

interface Prepared {
  current: ReturnType<ReturnType<typeof getDb>["prepare"]>;
  market: ReturnType<ReturnType<typeof getDb>["prepare"]>;
  sample: ReturnType<ReturnType<typeof getDb>["prepare"]>;
}

let prepared: Prepared | null = null;

function statements(): Prepared {
  if (!prepared) {
    const db = getDb();
    prepared = {
      current: db.prepare(
        `SELECT slug, asset, period, start_epoch, end_epoch, title, resolved
         FROM markets
         WHERE asset = ? AND period = ? AND start_epoch <= ? AND end_epoch > ?
         ORDER BY start_epoch DESC LIMIT 1`,
      ),
      market: db.prepare(
        `SELECT slug, asset, period, start_epoch, end_epoch, title, resolved
         FROM markets WHERE slug = ?`,
      ),
      sample: db.prepare(
        `SELECT ts, up_bid, up_ask, up_mid, up_last,
                down_bid, down_ask, down_mid, down_last
         FROM samples WHERE slug = ? ORDER BY ts DESC LIMIT 1`,
      ),
    };
  }
  return prepared;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapSample(row: Record<string, unknown> | undefined): SampleRow | null {
  if (!row) return null;
  return {
    ts: Number(row.ts ?? 0),
    up_bid: numOrNull(row.up_bid),
    up_ask: numOrNull(row.up_ask),
    up_mid: numOrNull(row.up_mid),
    up_last: numOrNull(row.up_last),
    down_bid: numOrNull(row.down_bid),
    down_ask: numOrNull(row.down_ask),
    down_mid: numOrNull(row.down_mid),
    down_last: numOrNull(row.down_last),
  };
}

function getCurrentMarket(
  asset: string,
  period: string,
  now: number,
): MarketRow | null {
  const row = statements().current.get(asset, period, now, now) as unknown as
    | Record<string, unknown>
    | undefined;
  return row
    ? {
        slug: String(row.slug),
        asset: String(row.asset),
        period: String(row.period),
        start_epoch: Number(row.start_epoch),
        end_epoch: Number(row.end_epoch),
        title: typeof row.title === "string" ? row.title : null,
        resolved: String(row.resolved ?? "UNKNOWN"),
      }
    : null;
}

function getMarket(slug: string): MarketRow | null {
  const row = statements().market.get(slug) as unknown as
    | Record<string, unknown>
    | undefined;
  return row
    ? {
        slug: String(row.slug),
        asset: String(row.asset),
        period: String(row.period),
        start_epoch: Number(row.start_epoch),
        end_epoch: Number(row.end_epoch),
        title: typeof row.title === "string" ? row.title : null,
        resolved: String(row.resolved ?? "UNKNOWN"),
      }
    : null;
}

function getLatestSample(slug: string): SampleRow | null {
  return mapSample(
    statements().sample.get(slug) as unknown as
      | Record<string, unknown>
      | undefined,
  );
}

function parseConfig(strategy: PaperStrategySummary): PaperStrategyConfig {
  try {
    return normalizePaperConfig(
      strategy.kind,
      JSON.parse(strategy.config_json) as unknown,
    );
  } catch {
    return normalizePaperConfig(strategy.kind, {});
  }
}

const WINDOW_RANGES: Record<string, [number, number]> = {
  "0-30s": [0, 30],
  "30-60s": [30, 60],
  "1-2m": [60, 120],
  "2-3m": [120, 180],
  "3-4m": [180, 240],
  "4-5m": [240, 300],
};

function windowLabel(elapsed: number): string {
  for (const [label, [min, max]] of Object.entries(WINDOW_RANGES)) {
    if (elapsed >= min && elapsed < max) return label;
  }
  return elapsed < 0 ? "pre-start" : "after-end";
}

function windowAllowed(
  config: PaperStrategyConfig,
  elapsed: number,
): boolean {
  const allowed = config.allowedWindows;
  if (!allowed || allowed.length === 0) return true;
  return allowed.some((label) => {
    const range = WINDOW_RANGES[label];
    return range != null && elapsed >= range[0] && elapsed < range[1];
  });
}

function errorText(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  return message.slice(0, 500);
}

function settleOpenPositions(
  strategy: PaperStrategySummary,
  now: number,
): number {
  let settled = 0;
  for (const position of getOpenPaperPositions(strategy.id)) {
    const market = getMarket(position.slug);
    if (!market || market.end_epoch > now) continue;
    if (market.resolved !== "UP" && market.resolved !== "DOWN") continue;

    const winning = market.resolved === position.outcome;
    const payout = winning ? position.shares : 0;
    const settlement = settlePaperPosition({
      strategyId: strategy.id,
      positionId: position.id,
      payout,
      settlementPrice: winning ? 1 : 0,
      now,
    });
    if (settlement) settled += 1;
  }
  return settled;
}

function markToMarket(strategy: PaperStrategySummary, now: number): void {
  const positions = getOpenPaperPositions(strategy.id);
  let positionsValue = 0;
  let cost = 0;

  for (const position of positions) {
    const sample = getLatestSample(position.slug);
    let price = position.last_price ?? position.avg_price;
    if (sample) {
      const mid =
        position.outcome === "DOWN" ? sample.down_mid : sample.up_mid;
      if (mid != null) price = mid;
    }
    const value = position.shares * price;
    markPaperPosition(position.id, price, value, now);
    positionsValue += value;
    cost += position.cost;
  }

  const summary = getPaperStrategySummary(strategy.id);
  if (!summary) return;
  recordPaperEquity({
    strategyId: strategy.id,
    ts: Math.floor(now / 60) * 60,
    cash: summary.cash,
    positionsValue,
    realizedPnl: summary.realized_pnl,
    unrealizedPnl: positionsValue - cost,
    equity: summary.cash + positionsValue,
  });
}

function tickPairLock(
  strategy: PaperStrategySummary,
  market: MarketRow,
  sample: SampleRow,
  config: PaperStrategyConfig,
  now: number,
): number {
  if (hasPaperMarketActivity(strategy.id, market.slug)) return 0;

  const slippage = (config.slippageBps ?? 0) / 10_000;
  const upAsk = sample.up_ask;
  const downAsk = sample.down_ask;
  if (upAsk == null || downAsk == null || upAsk <= 0 || downAsk <= 0) {
    return 0;
  }

  const upPrice = upAsk * (1 + slippage);
  const downPrice = downAsk * (1 + slippage);
  const pairCost = upPrice + downPrice;
  const edge = 1 - pairCost;
  if (!Number.isFinite(edge) || edge < (config.minEdge ?? 0.01)) return 0;

  const feeRate = config.feeRate ?? 0;
  const maxOpenCost = config.maxOpenCost ?? 10_000_000;
  const openCost = getPaperOpenCost(strategy.id);
  const budget =
    Math.min(
      config.pairNotional ?? 25,
      config.maxCostPerMarket ?? 10_000_000,
      maxOpenCost - openCost,
      (strategy.cash * 0.98) / (1 + feeRate),
    );

  if (!(budget > 0.01)) return 0;

  const shares = Number((budget / pairCost).toFixed(4));
  if (!(shares > 0.0001)) return 0;

  const upNotional = shares * upPrice;
  const downNotional = shares * downPrice;
  const upFee = upNotional * feeRate;
  const downFee = downNotional * feeRate;
  if (
    upNotional + downNotional + upFee + downFee >
    strategy.cash
  ) {
    return 0;
  }

  const signal = {
    pairCost,
    edge,
    upAsk,
    downAsk,
    upPrice,
    downPrice,
    shares,
    elapsed: now - market.start_epoch,
    window: windowLabel(now - market.start_epoch),
  };

  recordPaperBuy({
    strategyId: strategy.id,
    slug: market.slug,
    asset: market.asset,
    period: market.period,
    title: market.title,
    outcome: "UP",
    price: upPrice,
    shares,
    fee: upFee,
    reason: "pair_lock",
    signal,
    midAtFill: sample.up_mid,
    marketEndAt: market.end_epoch,
    now,
  });
  recordPaperBuy({
    strategyId: strategy.id,
    slug: market.slug,
    asset: market.asset,
    period: market.period,
    title: market.title,
    outcome: "DOWN",
    price: downPrice,
    shares,
    fee: downFee,
    reason: "pair_lock",
    signal,
    midAtFill: sample.down_mid,
    marketEndAt: market.end_epoch,
    now,
  });
  return 2;
}

const lastSeenPrints = new Map<string, number>();

function tickMidMaker(
  strategy: PaperStrategySummary,
  market: MarketRow,
  sample: SampleRow,
  config: PaperStrategyConfig,
  now: number,
): number {
  const elapsed = now - market.start_epoch;
  // allowedWindows is defined for 5m windows. Longer periods are evaluated
  // continuously unless the operator later adds period-aware windows.
  if (market.period === "5m" && !windowAllowed(config, elapsed)) return 0;

  const minPrice = config.minPrice ?? 0.3;
  const maxPrice = config.maxPrice ?? 0.9;
  const minEdge = config.minEdge ?? 0.005;
  const feeRate = config.feeRate ?? 0;
  const rebateRate = (config.makerRebateBps ?? 0) / 10_000;
  const netFeeRate = feeRate - rebateRate;
  const maxMarketCost = config.maxCostPerMarket ?? 50;
  const maxOpenCost = config.maxOpenCost ?? 600;
  const minSeconds = config.minSecondsBetweenEntries ?? 10;

  let cash = strategy.cash;
  let openCost = getPaperOpenCost(strategy.id);
  let marketCost = getPaperMarketCost(strategy.id, market.slug);
  let trades = 0;

  for (const outcome of ["UP", "DOWN"] as const) {
    if (cash <= 0) break;
    if (marketCost >= maxMarketCost) break;
    if (openCost >= maxOpenCost) break;

    const bid = outcome === "UP" ? sample.up_bid : sample.down_bid;
    const mid = outcome === "UP" ? sample.up_mid : sample.down_mid;
    const last = outcome === "UP" ? sample.up_last : sample.down_last;
    if (bid == null || mid == null || last == null) continue;
    if (!(bid > 0) || !(mid > 0) || !(last > 0)) continue;

    const quote = Math.min(bid, mid - minEdge);
    if (!(quote >= minPrice) || !(quote <= maxPrice)) continue;
    if (!(last <= quote)) continue;

    const printKey = `${strategy.id}:${market.slug}:${outcome}`;
    const previousPrint = lastSeenPrints.get(printKey);
    lastSeenPrints.set(printKey, last);
    if (previousPrint == null || previousPrint === last) continue;

    const lastEntry = getLastPaperEntryAt(
      strategy.id,
      market.slug,
      outcome,
    );
    if (lastEntry != null && now - lastEntry < minSeconds) continue;

    const marketRoom = maxMarketCost - marketCost;
    const openRoom = maxOpenCost - openCost;
    const cashRoom = (cash * 0.98) / (1 + Math.max(0, netFeeRate));
    const spend = Math.min(
      config.sizeUsd ?? 5,
      marketRoom,
      openRoom,
      cashRoom,
    );
    if (!(spend > 0.5)) continue;

    const shares = Number((spend / quote).toFixed(4));
    if (!(shares > 0.0001)) continue;
    const notional = shares * quote;
    const fee = notional * netFeeRate;
    if (notional + fee > cash) continue;

    const signal = {
      bid,
      mid,
      last,
      quote,
      discount: mid - quote,
      elapsed,
      window:
        market.period === "5m"
          ? windowLabel(elapsed)
          : `${Math.floor(elapsed / 60)}m`,
      feeRate,
      rebateRate,
      fillModel: "last_trade_cross",
    };

    recordPaperBuy({
      strategyId: strategy.id,
      slug: market.slug,
      asset: market.asset,
      period: market.period,
      title: market.title,
      outcome,
      price: quote,
      shares,
      fee,
      reason: "mid_maker",
      signal,
      midAtFill: mid,
      marketEndAt: market.end_epoch,
      now,
    });

    cash -= notional + fee;
    openCost += notional;
    marketCost += notional;
    trades += 1;
  }

  return trades;
}

function tickStrategy(
  strategy: PaperStrategySummary,
  allowTrades: boolean,
): {
  trades: number;
  settlements: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const config = parseConfig(strategy);
  const settlements = settleOpenPositions(strategy, now);
  let trades = 0;

  if (allowTrades) {
    const market = getCurrentMarket(strategy.asset, strategy.period, now);
    if (market) {
      const sample = getLatestSample(market.slug);
      const maxAge = config.maxSampleAgeSeconds ?? 10;
      if (sample && now - sample.ts <= maxAge) {
        trades =
          strategy.kind === "pair_lock"
            ? tickPairLock(strategy, market, sample, config, now)
            : tickMidMaker(strategy, market, sample, config, now);
      }
    }
  }

  markToMarket(strategy, now);
  updatePaperStrategyTick(strategy.id, now, null);
  return { trades, settlements };
}

export function tickPaperEngine(): PaperTickResult {
  try {
    updatePaperFillMarkouts();
  } catch (error) {
    console.error("[paper] markout update failed", error);
  }

  // Paused strategies still need to settle and mark existing positions.
  const strategies = listPaperStrategies().filter(
    (strategy) => strategy.active === 1 || strategy.open_positions > 0,
  );
  const result: PaperTickResult = {
    strategies: strategies.length,
    trades: 0,
    settlements: 0,
    errors: [],
  };

  for (const strategy of strategies) {
    try {
      const tick = tickStrategy(strategy, strategy.active === 1);
      result.trades += tick.trades;
      result.settlements += tick.settlements;
    } catch (error) {
      const message = errorText(error);
      result.errors.push(`${strategy.name}: ${message}`);
      updatePaperStrategyTick(
        strategy.id,
        Math.floor(Date.now() / 1000),
        message,
      );
    }
  }

  if (result.trades > 0 || result.settlements > 0 || result.errors.length > 0) {
    console.log(
      `[paper] strategies=${result.strategies} trades=${result.trades} settlements=${result.settlements}` +
        (result.errors.length > 0
          ? ` errors=${result.errors.join("; ")}`
          : ""),
    );
  }
  return result;
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  (timer as unknown as { unref?: () => void }).unref?.();
}

type GlobalWithPaperEngine = typeof globalThis & {
  __polyklinesPaperEngine?: boolean;
};

const globalStore = globalThis as GlobalWithPaperEngine;

export function startPaperEngine(): void {
  if (globalStore.__polyklinesPaperEngine) return;
  globalStore.__polyklinesPaperEngine = true;

  const parsed = Number.parseInt(
    process.env.POLY_PAPER_TICK_SECONDS ?? "",
    10,
  );
  const seconds = Number.isFinite(parsed)
    ? Math.min(60, Math.max(2, parsed))
    : 5;

  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    try {
      tickPaperEngine();
    } catch (error) {
      console.error("[paper] tick failed", error);
    } finally {
      running = false;
    }
  };

  const initial = setTimeout(run, 3_000);
  unrefTimer(initial);
  const timer = setInterval(run, seconds * 1_000);
  unrefTimer(timer);

  console.log(`[paper] paper trading engine enabled every ${seconds}s`);
}

export function getPaperEngineDebugState(): {
  lastSeenPrints: number;
  prepared: boolean;
} {
  return {
    lastSeenPrints: lastSeenPrints.size,
    prepared: prepared != null,
  };
}

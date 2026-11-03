import type { Period } from "@/lib/types";
import { getCoverage } from "@/server/query/coverage";
import { listExportMarkets } from "@/server/query/markets";
import { listSamplesInWindow } from "@/server/query/samples";

import { createSandbox, samplesToPayload, type StrategyOrder } from "./sandbox";

export const ENGINE_VERSION = "1.0.0";

export interface BacktestConfig {
  asset: string;
  period: Period;
  from: string;
  to: string;
  resolvedOnly: boolean;
  minSamples: number;
  stake: number;
  slippageBps: number;
  feeBps: number;
  params: Record<string, unknown>;
  source: string;
  strategyId?: string | null;
  strategyVersion?: number | null;
  exampleId?: string | null;
  trial?: boolean;
  maxWindows: number;
  timeLimitMs: number;
  maxGapSeconds?: number;
}

export interface BacktestTrade {
  seq: number;
  slug: string;
  asset: string;
  period: string;
  side: "UP" | "DOWN";
  entryTs: number;
  entryPrice: number;
  shares: number;
  stake: number;
  exitTs: number | null;
  exitPrice: number | null;
  resolution: string;
  pnl: number;
  returnPct: number;
}

export interface CalibrationBucket {
  label: string;
  count: number;
  wins: number;
  avgPrice: number;
  winRate: number;
}

export interface BacktestSkipped {
  unresolved: number;
  missingSamples: number;
  belowMinSamples: number;
  badDecision: number;
  staleSample: number;
  noTrade: number;
  invalidPrice: number;
  invalidExit: number;
}

export interface BacktestSummary {
  engineVersion: string;
  asset: string;
  period: string;
  from: string;
  to: string;
  mode: "point" | "stream";
  windows: number;
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  totalStaked: number;
  pnl: number;
  roi: number | null;
  profitFactor: number | null;
  maxDrawdown: number;
  sharpe: number | null;
  brier: number | null;
  avgEntry: number | null;
  edge: number | null;
  calibration: CalibrationBucket[];
  byAsset: Record<string, { trades: number; pnl: number; wins: number }>;
  byPeriod: Record<string, { trades: number; pnl: number; wins: number }>;
  byDay: Record<string, { trades: number; pnl: number; wins: number }>;
  equityCurve: Array<{ t: number; pnl: number; cumPnl: number }>;
  skipped: BacktestSkipped;
  durationMs: number;
  dataCutoff: number;
}

export interface BacktestResult {
  summary: BacktestSummary;
  trades: BacktestTrade[];
}

export interface BacktestProgress {
  processed: number;
  total: number;
  trades: number;
}

export type ProgressCallback = (progress: BacktestProgress) => void;

function dateToEpoch(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);
}

function emptySkipped(): BacktestSkipped {
  return {
    unresolved: 0,
    missingSamples: 0,
    belowMinSamples: 0,
    badDecision: 0,
    staleSample: 0,
    noTrade: 0,
    invalidPrice: 0,
    invalidExit: 0,
  };
}

function entryPrice(
  ask: number | null,
  slippageBps: number,
  limitPrice: number | null,
): number | null {
  if (ask == null || ask <= 0 || ask >= 1) return null;
  if (limitPrice != null && ask > limitPrice) return null;
  const price = ask * (1 + slippageBps / 10_000);
  if (price <= 0 || price >= 1) return null;
  return price;
}

function exitPrice(bid: number | null, slippageBps: number): number | null {
  if (bid == null || bid <= 0 || bid >= 1) return null;
  const price = bid * (1 - slippageBps / 10_000);
  if (price <= 0 || price >= 1) return null;
  return price;
}

function makeTrade(
  seq: number,
  market: { slug: string; asset: string; period: string; end_epoch: number },
  side: "UP" | "DOWN",
  entryTs: number,
  price: number,
  stake: number,
  resolution: string,
  settlementPayout: number,
  feeBps: number,
): BacktestTrade {
  const shares = stake / price;
  const pnl = shares * settlementPayout * (1 - feeBps / 10_000) - stake;
  return {
    seq,
    slug: market.slug,
    asset: market.asset,
    period: market.period,
    side,
    entryTs,
    entryPrice: price,
    shares,
    stake,
    exitTs: market.end_epoch,
    exitPrice: settlementPayout,
    resolution,
    pnl,
    returnPct: stake > 0 ? pnl / stake : 0,
  };
}

export async function runBacktest(
  config: BacktestConfig,
  onProgress?: ProgressCallback,
  options?: { shouldCancel?: () => boolean },
): Promise<BacktestResult> {
  const startedAt = Date.now();
  const deadline = startedAt + config.timeLimitMs;
  const total = getCoverage(
    config.asset,
    config.period,
    config.from,
    config.to,
  ).markets;

  const sandbox = await createSandbox(config.source, config.params, {
    totalMs: config.timeLimitMs,
  });
  const trades: BacktestTrade[] = [];
  const skipped = emptySkipped();
  let processed = 0;

  const fromEpoch = dateToEpoch(config.from);
  const toEpochExclusive = dateToEpoch(config.to) + 86_400;

  try {
    for (
      let dayStart = fromEpoch;
      dayStart < toEpochExclusive;
      dayStart += 86_400
    ) {
      const dayEnd = Math.min(dayStart + 86_400, toEpochExclusive);
      const markets = listExportMarkets(
        config.asset,
        config.period,
        dayStart,
        dayEnd,
        config.resolvedOnly,
      );

      for (const market of markets) {
        if (options?.shouldCancel?.()) {
          throw new Error("Canceled by user.");
        }
        processed += 1;
        if (processed > config.maxWindows) {
          throw new Error(
            `This run exceeds the ${config.maxWindows.toLocaleString("en-US")} window limit for your plan.`,
          );
        }
        if (Date.now() > deadline) {
          throw new Error("Backtest exceeded the time limit for your plan.");
        }

        if (market.resolved !== "UP" && market.resolved !== "DOWN") {
          skipped.unresolved += 1;
          continue;
        }

        const samples = listSamplesInWindow(
          market.slug,
          market.start_epoch,
          market.end_epoch,
        );
        if (samples.length === 0) {
          skipped.missingSamples += 1;
          continue;
        }
        if (samples.length < config.minSamples) {
          skipped.belowMinSamples += 1;
          continue;
        }

        if (sandbox.mode === "point") {
          const duration = market.end_epoch - market.start_epoch;
          const decisionBeforeEnd = sandbox.decisionBeforeEnd;
          if (decisionBeforeEnd < 0 || decisionBeforeEnd > duration) {
            skipped.badDecision += 1;
            continue;
          }
          const decisionTs = market.end_epoch - decisionBeforeEnd;
          let latestIndex = -1;
          for (let i = 0; i < samples.length; i += 1) {
            if (samples[i].ts <= decisionTs) latestIndex = i;
            else break;
          }
          if (latestIndex < 0) {
            skipped.missingSamples += 1;
            continue;
          }
          const latest = samples[latestIndex];
          if (decisionTs - latest.ts > (config.maxGapSeconds ?? 120)) {
            skipped.staleSample += 1;
            continue;
          }

          const prefix = samples.slice(0, latestIndex + 1);
          const payloadSamples = samplesToPayload(prefix);
          const order = sandbox.run({
            market: {
              slug: market.slug,
              asset: market.asset,
              period: market.period,
              start: market.start_epoch,
              end: market.end_epoch,
            },
            params: config.params,
            samples: payloadSamples,
            latest: payloadSamples[payloadSamples.length - 1],
          });

          const decision = Array.isArray(order)
            ? order[0]
            : (order as StrategyOrder | null);
          if (!decision || decision.action !== "enter") {
            skipped.noTrade += 1;
            continue;
          }
          const side = decision.side;
          if (side !== "UP" && side !== "DOWN") {
            skipped.noTrade += 1;
            continue;
          }
          const stake = Number(decision.stake);
          if (!Number.isFinite(stake) || stake <= 0) {
            skipped.noTrade += 1;
            continue;
          }
          const book = side === "UP" ? "up" : "down";
          const price = entryPrice(
            latest[`${book}_ask`] ?? null,
            config.slippageBps,
            decision.limitPrice ?? null,
          );
          if (price == null) {
            skipped.invalidPrice += 1;
            continue;
          }
          const payout = market.resolved === side ? 1 : 0;
          trades.push(
            makeTrade(
              trades.length + 1,
              market,
              side,
              latest.ts,
              price,
              stake,
              market.resolved,
              payout,
              config.feeBps,
            ),
          );
        } else {
          const payloadSamples = samplesToPayload(samples);
          const orders = sandbox.run({
            market: {
              slug: market.slug,
              asset: market.asset,
              period: market.period,
              start: market.start_epoch,
              end: market.end_epoch,
            },
            params: config.params,
            samples: payloadSamples,
          });
          const list = Array.isArray(orders) ? orders : [];
          let open: {
            side: "UP" | "DOWN";
            entryTs: number;
            entryPrice: number;
            shares: number;
            stake: number;
          } | null = null;
          let entered = false;

          for (const order of list) {
            const index = Number(order.index);
            if (!Number.isInteger(index) || index < 0 || index >= samples.length) {
              continue;
            }
            const sample = samples[index];
            if (order.action === "enter" && !entered) {
              const side = order.side;
              if (side !== "UP" && side !== "DOWN") continue;
              const stake = Number(order.stake);
              if (!Number.isFinite(stake) || stake <= 0) continue;
              const price = entryPrice(
                side === "UP" ? sample.up_ask : sample.down_ask,
                config.slippageBps,
                order.limitPrice ?? null,
              );
              if (price == null) {
                skipped.invalidPrice += 1;
                continue;
              }
              entered = true;
              open = {
                side,
                entryTs: sample.ts,
                entryPrice: price,
                shares: stake / price,
                stake,
              };
            } else if (order.action === "exit" && open) {
              const price = exitPrice(
                open.side === "UP" ? sample.up_bid : sample.down_bid,
                config.slippageBps,
              );
              if (price == null) {
                skipped.invalidExit += 1;
                continue;
              }
              const pnl =
                open.shares * price * (1 - config.feeBps / 10_000) - open.stake;
              trades.push({
                seq: trades.length + 1,
                slug: market.slug,
                asset: market.asset,
                period: market.period,
                side: open.side,
                entryTs: open.entryTs,
                entryPrice: open.entryPrice,
                shares: open.shares,
                stake: open.stake,
                exitTs: sample.ts,
                exitPrice: price,
                resolution: market.resolved,
                pnl,
                returnPct: open.stake > 0 ? pnl / open.stake : 0,
              });
              open = null;
            }
          }

          if (open) {
            const payout = market.resolved === open.side ? 1 : 0;
            trades.push({
              seq: trades.length + 1,
              slug: market.slug,
              asset: market.asset,
              period: market.period,
              side: open.side,
              entryTs: open.entryTs,
              entryPrice: open.entryPrice,
              shares: open.shares,
              stake: open.stake,
              exitTs: market.end_epoch,
              exitPrice: payout,
              resolution: market.resolved,
              pnl:
                open.shares * payout * (1 - config.feeBps / 10_000) -
                open.stake,
              returnPct:
                open.stake > 0
                  ? (open.shares * payout * (1 - config.feeBps / 10_000) -
                      open.stake) /
                    open.stake
                  : 0,
            });
          } else if (!entered) {
            skipped.noTrade += 1;
          }
        }

        if (processed % 100 === 0) {
          onProgress?.({ processed, total, trades: trades.length });
        }
      }
    }
  } finally {
    sandbox.close();
  }

  const summary = summarize(
    config,
    sandbox.mode,
    processed,
    trades,
    skipped,
    startedAt,
  );
  onProgress?.({ processed, total, trades: trades.length });
  return { summary, trades };
}

function summarize(
  config: BacktestConfig,
  mode: "point" | "stream",
  windows: number,
  trades: BacktestTrade[],
  skipped: BacktestSkipped,
  startedAt: number,
): BacktestSummary {
  const ordered = [...trades].sort((a, b) => a.entryTs - b.entryTs);
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equityCurve = ordered.map((trade) => {
    cumulative += trade.pnl;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    return { t: trade.entryTs, pnl: trade.pnl, cumPnl: cumulative };
  });

  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const losses = trades.filter((trade) => trade.pnl < 0).length;
  const breakeven = trades.length - wins - losses;
  const totalStaked = trades.reduce((sum, trade) => sum + trade.stake, 0);
  const pnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossProfit = trades
    .filter((trade) => trade.pnl > 0)
    .reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(
    trades
      .filter((trade) => trade.pnl < 0)
      .reduce((sum, trade) => sum + trade.pnl, 0),
  );
  const returns = trades.map((trade) => trade.returnPct);
  const meanReturn =
    returns.length > 0
      ? returns.reduce((sum, value) => sum + value, 0) / returns.length
      : 0;
  const variance =
    returns.length > 1
      ? returns.reduce((sum, value) => sum + (value - meanReturn) ** 2, 0) /
        (returns.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);
  const avgEntry =
    trades.length > 0
      ? trades.reduce((sum, trade) => sum + trade.entryPrice, 0) / trades.length
      : null;
  const winRate = trades.length > 0 ? wins / trades.length : null;
  const brier =
    trades.length > 0
      ? trades.reduce((sum, trade) => {
          const outcome = trade.resolution === trade.side ? 1 : 0;
          return sum + (trade.entryPrice - outcome) ** 2;
        }, 0) / trades.length
      : null;

  const buckets = Array.from({ length: 5 }, (_, index) => ({
    label: `${(index * 0.2).toFixed(1)}-${((index + 1) * 0.2).toFixed(1)}`,
    count: 0,
    wins: 0,
    priceSum: 0,
  }));
  for (const trade of trades) {
    const index = Math.min(4, Math.max(0, Math.floor(trade.entryPrice * 5)));
    const bucket = buckets[index];
    bucket.count += 1;
    bucket.priceSum += trade.entryPrice;
    if (trade.resolution === trade.side) bucket.wins += 1;
  }

  const byAsset: Record<string, { trades: number; pnl: number; wins: number }> = {};
  const byPeriod: Record<string, { trades: number; pnl: number; wins: number }> = {};
  const byDay: Record<string, { trades: number; pnl: number; wins: number }> = {};
  const add = (
    map: Record<string, { trades: number; pnl: number; wins: number }>,
    key: string,
    trade: BacktestTrade,
  ) => {
    const item = map[key] ?? { trades: 0, pnl: 0, wins: 0 };
    item.trades += 1;
    item.pnl += trade.pnl;
    if (trade.pnl > 0) item.wins += 1;
    map[key] = item;
  };
  for (const trade of trades) {
    add(byAsset, trade.asset, trade);
    add(byPeriod, trade.period, trade);
    add(
      byDay,
      new Date(trade.entryTs * 1000).toISOString().slice(0, 10),
      trade,
    );
  }

  return {
    engineVersion: ENGINE_VERSION,
    asset: config.asset,
    period: config.period,
    from: config.from,
    to: config.to,
    mode,
    windows,
    trades: trades.length,
    wins,
    losses,
    breakeven,
    winRate,
    totalStaked,
    pnl,
    roi: totalStaked > 0 ? pnl / totalStaked : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    maxDrawdown,
    sharpe:
      returns.length > 1 && stdDev > 0
        ? (meanReturn / stdDev) * Math.sqrt(returns.length)
        : null,
    brier,
    avgEntry,
    edge:
      winRate != null && avgEntry != null ? winRate - avgEntry : null,
    calibration: buckets.map((bucket) => ({
      label: bucket.label,
      count: bucket.count,
      wins: bucket.wins,
      avgPrice: bucket.count > 0 ? bucket.priceSum / bucket.count : 0,
      winRate: bucket.count > 0 ? bucket.wins / bucket.count : 0,
    })),
    byAsset,
    byPeriod,
    byDay,
    equityCurve,
    skipped,
    durationMs: Date.now() - startedAt,
    dataCutoff: Math.floor(startedAt / 1000),
  };
}

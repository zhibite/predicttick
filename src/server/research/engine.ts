import { getDb } from "../db";
import {
  fetchActivityByTypes,
  fetchLeaderboardStanding,
  fetchTradeActivityPage,
  fetchUserStats,
} from "../leaderboard/api";
import type {
  LeaderboardActivity,
  TraderLifetimeStats,
  TraderStanding,
} from "../leaderboard/types";
import {
  claimNextResearchRun,
  getResearchRun,
  getResearchTradeChunk,
  getResearchTradesForSlug,
  insertResearchTrades,
  listResearchSlugs,
  resetStaleResearchRuns,
  updateResearchRun,
  updateResearchTradeEnrichment,
} from "./store";
import type {
  ResearchHorizonStats,
  ResearchRunRow,
  ResearchSummary,
  ResearchTimingBucket,
  ResearchTradeRow,
} from "./types";

const SAMPLE_TOLERANCE = 8;
const END_TOLERANCE = 15;

interface MarketInfo {
  title: string | null;
  start_epoch: number;
  end_epoch: number;
  resolved: string;
}

interface SamplePoint {
  ts: number;
  up_mid: number | null;
  down_mid: number | null;
}

let marketStmts: {
  market: ReturnType<ReturnType<typeof getDb>["prepare"]>;
  samples: ReturnType<ReturnType<typeof getDb>["prepare"]>;
} | null = null;

function statements() {
  if (!marketStmts) {
    const db = getDb();
    marketStmts = {
      market: db.prepare(
        `SELECT title, start_epoch, end_epoch, resolved
         FROM markets WHERE slug = ?`,
      ),
      samples: db.prepare(
        `SELECT ts, up_mid, down_mid FROM samples
         WHERE slug = ? ORDER BY ts ASC`,
      ),
    };
  }
  return marketStmts;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 600);
}

function getMarket(slug: string): MarketInfo | null {
  const row = statements().market.get(slug) as unknown as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    title: typeof row.title === "string" ? row.title : null,
    start_epoch: Number(row.start_epoch),
    end_epoch: Number(row.end_epoch),
    resolved: String(row.resolved ?? "UNKNOWN"),
  };
}

function getSamples(slug: string): SamplePoint[] {
  const rows = statements().samples.all(slug) as unknown as Array<
    Record<string, unknown>
  >;
  return rows.map((row) => ({
    ts: Number(row.ts),
    up_mid:
      typeof row.up_mid === "number" && Number.isFinite(row.up_mid)
        ? row.up_mid
        : null,
    down_mid:
      typeof row.down_mid === "number" && Number.isFinite(row.down_mid)
        ? row.down_mid
        : null,
  }));
}

function midOf(sample: SamplePoint, outcome: string): number | null {
  return outcome === "DOWN" ? sample.down_mid : sample.up_mid;
}

function findIndex(samples: SamplePoint[], target: number): number {
  let low = 0;
  let high = samples.length - 1;
  let best = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (samples[mid].ts <= target) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function midBefore(
  samples: SamplePoint[],
  target: number,
  outcome: string,
  tolerance = SAMPLE_TOLERANCE,
): number | null {
  const index = findIndex(samples, target);
  if (index < 0) return null;
  if (target - samples[index].ts > tolerance) return null;
  return midOf(samples[index], outcome);
}

function midAfter(
  samples: SamplePoint[],
  target: number,
  outcome: string,
  tolerance = SAMPLE_TOLERANCE,
): number | null {
  const index = findIndex(samples, target);
  const next = index + 1;
  if (next < 0 || next >= samples.length) return null;
  if (samples[next].ts - target > tolerance) return null;
  return midOf(samples[next], outcome);
}

function midAtFill(
  samples: SamplePoint[],
  target: number,
  outcome: string,
): number | null {
  return (
    midBefore(samples, target, outcome) ??
    midAfter(samples, target, outcome)
  );
}

function horizonMid(
  samples: SamplePoint[],
  target: number,
  marketEnd: number | null,
  outcome: string,
): number | null {
  if (marketEnd != null && target > marketEnd) return null;
  return midAfter(samples, target, outcome);
}

function enqueuePage(
  runId: string,
  rows: LeaderboardActivity[],
): number {
  const trades = rows
    .filter(
      (row): row is LeaderboardActivity & { slug: string } =>
        typeof row.slug === "string" &&
        row.slug.length > 0 &&
        row.timestamp > 0,
    )
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      condition_id: row.conditionId,
      outcome: row.outcome,
      side: row.side,
      price: row.price,
      size: row.size,
      usdc_size: row.usdcSize,
      trade_ts: row.timestamp,
    }));
  insertResearchTrades(runId, trades);
  return trades.length;
}

interface StatsAccumulator {
  count: number;
  entrySum: number;
  entryN: number;
  entryPositive: number;
  mo1Sum: number;
  mo1N: number;
  mo10Sum: number;
  mo10N: number;
  mo60Sum: number;
  mo60N: number;
  endSum: number;
  endN: number;
  endPositive: number;
}

function newAccumulator(): StatsAccumulator {
  return {
    count: 0,
    entrySum: 0,
    entryN: 0,
    entryPositive: 0,
    mo1Sum: 0,
    mo1N: 0,
    mo10Sum: 0,
    mo10N: 0,
    mo60Sum: 0,
    mo60N: 0,
    endSum: 0,
    endN: 0,
    endPositive: 0,
  };
}

function addSample(
  acc: StatsAccumulator,
  trade: ResearchTradeRow,
): void {
  acc.count += 1;
  if (trade.entry_edge != null) {
    acc.entrySum += trade.entry_edge;
    acc.entryN += 1;
    if (trade.entry_edge > 0) acc.entryPositive += 1;
  }
  if (trade.markout_1s != null) {
    acc.mo1Sum += trade.markout_1s;
    acc.mo1N += 1;
  }
  if (trade.markout_10s != null) {
    acc.mo10Sum += trade.markout_10s;
    acc.mo10N += 1;
  }
  if (trade.markout_60s != null) {
    acc.mo60Sum += trade.markout_60s;
    acc.mo60N += 1;
  }
  if (trade.markout_end != null) {
    acc.endSum += trade.markout_end;
    acc.endN += 1;
    if (trade.markout_end > 0) acc.endPositive += 1;
  }
}

function finishStats(acc: StatsAccumulator): ResearchHorizonStats {
  return {
    count: acc.count,
    entryEdge: acc.entryN > 0 ? acc.entrySum / acc.entryN : null,
    entryEdgePositive:
      acc.entryN > 0 ? (acc.entryPositive / acc.entryN) * 100 : null,
    markout1s: acc.mo1N > 0 ? acc.mo1Sum / acc.mo1N : null,
    markout10s: acc.mo10N > 0 ? acc.mo10Sum / acc.mo10N : null,
    markout60s: acc.mo60N > 0 ? acc.mo60Sum / acc.mo60N : null,
    markoutEnd: acc.endN > 0 ? acc.endSum / acc.endN : null,
    endPositive:
      acc.endN > 0 ? (acc.endPositive / acc.endN) * 100 : null,
  };
}

function windowLabel(elapsed: number | null): string {
  if (elapsed == null) return "unknown";
  if (elapsed < 30) return "0-30s";
  if (elapsed < 60) return "30-60s";
  if (elapsed < 120) return "1-2m";
  if (elapsed < 180) return "2-3m";
  if (elapsed < 240) return "3-4m";
  if (elapsed < 300) return "4-5m";
  return "5m+";
}

function priceBucket(price: number): string {
  if (price < 0.1) return "<0.10";
  if (price < 0.3) return "0.10-0.30";
  if (price < 0.5) return "0.30-0.50";
  if (price < 0.7) return "0.50-0.70";
  if (price < 0.9) return "0.70-0.90";
  return ">=0.90";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function computeSummary(
  run: ResearchRunRow,
  lifetime: TraderLifetimeStats | null,
  standing: TraderStanding | null,
  redeemRows: Awaited<ReturnType<typeof fetchActivityByTypes>>,
): Promise<ResearchSummary> {
  const overall = newAccumulator();
  const byWindow = new Map<string, StatsAccumulator>();
  const byPrice = new Map<string, StatsAccumulator>();
  const byOutcome = new Map<string, StatsAccumulator>();
  const timing = new Map<string, ResearchTimingBucket>();
  const markets = new Map<
    string,
    {
      upShares: number;
      upCost: number;
      downShares: number;
      downCost: number;
      volume: number;
    }
  >();

  let afterId = "";
  let rows = 0;
  let midCovered = 0;
  let firstAt: number | null = null;
  let lastAt: number | null = null;
  let sellCount = 0;

  while (true) {
    const chunk = getResearchTradeChunk(run.id, afterId, 5_000);
    if (chunk.length === 0) break;
    for (const trade of chunk) {
      rows += 1;
      addSample(overall, trade);
      if (trade.mid_at_fill != null) midCovered += 1;
      if (firstAt == null || trade.trade_ts < firstAt) firstAt = trade.trade_ts;
      if (lastAt == null || trade.trade_ts > lastAt) lastAt = trade.trade_ts;
      if (trade.side === "SELL") sellCount += 1;

      const w = windowLabel(trade.elapsed);
      const ws = byWindow.get(w) ?? newAccumulator();
      addSample(ws, trade);
      byWindow.set(w, ws);

      const p = priceBucket(trade.price);
      const ps = byPrice.get(p) ?? newAccumulator();
      addSample(ps, trade);
      byPrice.set(p, ps);

      const o = trade.outcome === "UP" || trade.outcome === "DOWN"
        ? trade.outcome
        : "OTHER";
      const os = byOutcome.get(o) ?? newAccumulator();
      addSample(os, trade);
      byOutcome.set(o, os);

      const t = timing.get(w) ?? {
        count: 0,
        volume: 0,
        volumeShare: null,
      };
      t.count += 1;
      t.volume += trade.usdc_size;
      timing.set(w, t);

      if (trade.side === "BUY") {
        const key = trade.condition_id ?? trade.slug;
        const market = markets.get(key) ?? {
          upShares: 0,
          upCost: 0,
          downShares: 0,
          downCost: 0,
          volume: 0,
        };
        if (trade.outcome === "DOWN") {
          market.downShares += trade.size;
          market.downCost += trade.usdc_size;
        } else {
          market.upShares += trade.size;
          market.upCost += trade.usdc_size;
        }
        market.volume += trade.usdc_size;
        markets.set(key, market);
      }
    }
    afterId = chunk[chunk.length - 1].id;
    await sleep(0);
  }

  const twoSided = [...markets.values()].filter(
    (market) => market.upShares > 0 && market.downShares > 0,
  );
  const paired = twoSided.map((market) => {
    const upAvg = market.upCost / market.upShares;
    const downAvg = market.downCost / market.downShares;
    const pairedShares = Math.min(market.upShares, market.downShares);
    return {
      sum: upAvg + downAvg,
      pairedShares,
      lockedProfit: pairedShares * Math.max(0, 1 - upAvg - downAvg),
      imbalance:
        (Math.abs(market.upShares - market.downShares) /
          (market.upShares + market.downShares)) *
        100,
    };
  });
  const totalPairedShares = paired.reduce(
    (sum, row) => sum + row.pairedShares,
    0,
  );
  const belowOneShares = paired
    .filter((row) => row.sum < 1)
    .reduce((sum, row) => sum + row.pairedShares, 0);

  const totalTimingVolume = [...timing.values()].reduce(
    (sum, row) => sum + row.volume,
    0,
  );
  for (const row of timing.values()) {
    row.volumeShare =
      totalTimingVolume > 0 ? (row.volume / totalTimingVolume) * 100 : null;
  }

  const redeem = redeemRows.filter((row) => row.type === "REDEEM");
  const makerRebate = lifetime?.makerRebate ?? 0;
  const takerRebate = lifetime?.takerRebate ?? 0;
  const economicPnl = lifetime?.economicPnl ?? 0;

  const tags: string[] = [];
  if (
    lifetime != null &&
    lifetime.tradeCount > 100_000
  ) {
    tags.push("high-frequency");
  }
  if (
    markets.size > 0 &&
    (twoSided.length / markets.size) * 100 >= 70
  ) {
    tags.push("two-sided");
  }
  if (rows > 0 && (sellCount / rows) * 100 < 10) {
    tags.push("hold-to-resolution");
  }
  if (economicPnl > 0 && makerRebate / economicPnl >= 0.2) {
    tags.push("rebate-dependent");
  }
  const bestWindow = [...byWindow.entries()]
    .filter(([, stats]) => stats.entryN > 0 && stats.endN > 0)
    .sort(
      (a, b) =>
        (b[1].endSum / b[1].endN) - (a[1].endSum / a[1].endN),
    )[0];
  if (bestWindow) tags.push(`best-window:${bestWindow[0]}`);
  const bestPrice = [...byPrice.entries()]
    .filter(([, stats]) => stats.endN > 0)
    .sort(
      (a, b) =>
        (b[1].endSum / b[1].endN) - (a[1].endSum / a[1].endN),
    )[0];
  if (bestPrice) tags.push(`best-price:${bestPrice[0]}`);

  const sampleSpanDays =
    firstAt != null && lastAt != null
      ? (lastAt - firstAt) / 86_400
      : null;

  return {
    address: run.address,
    generatedAt: Math.floor(Date.now() / 1000),
    coverage: {
      tradesFetched: rows,
      enriched: rows,
      midCovered,
      truncated: run.truncated === 1,
      firstTradeAt: firstAt,
      lastTradeAt: lastAt,
      sampleSpanDays,
    },
    lifetime,
    standing,
    markout: {
      overall: finishStats(overall),
      byWindow: Object.fromEntries(
        [...byWindow.entries()].map(([key, acc]) => [
          key,
          finishStats(acc),
        ]),
      ),
      byPrice: Object.fromEntries(
        [...byPrice.entries()].map(([key, acc]) => [
          key,
          finishStats(acc),
        ]),
      ),
      byOutcome: Object.fromEntries(
        [...byOutcome.entries()].map(([key, acc]) => [
          key,
          finishStats(acc),
        ]),
      ),
    },
    timing: Object.fromEntries(timing.entries()),
    pair: {
      markets: markets.size,
      twoSided: twoSided.length,
      twoSidedShare:
        markets.size > 0 ? (twoSided.length / markets.size) * 100 : null,
      pairedCostWeighted:
        totalPairedShares > 0
          ? paired.reduce(
              (sum, row) => sum + row.sum * row.pairedShares,
              0,
            ) / totalPairedShares
          : null,
      pairedCostMedian: median(paired.map((row) => row.sum)),
      pairedBelowOneShare:
        totalPairedShares > 0
          ? (belowOneShares / totalPairedShares) * 100
          : null,
      lockedProfitEstimate: paired.reduce(
        (sum, row) => sum + row.lockedProfit,
        0,
      ),
      imbalanceOver25: paired.filter((row) => row.imbalance > 25).length,
    },
    activity: {
      redeemCount: redeem.length,
      redeemValue: redeem.reduce((sum, row) => sum + row.usdcSize, 0),
      makerRebate,
      takerRebate,
    },
    tags,
  };
}

export async function processResearchRun(runId: string): Promise<void> {
  let run = getResearchRun(runId);
  if (!run) return;

  try {
    updateResearchRun(runId, {
      status: "FETCHING",
      error: null,
      finishedAt: null,
      progressTrades: 0,
      enrichedTrades: 0,
    });

    const [statsResult, standingResult] = await Promise.allSettled([
      fetchUserStats(run.address),
      fetchLeaderboardStanding(run.address),
    ]);
    const lifetime =
      statsResult.status === "fulfilled" ? statsResult.value : null;
    const standing =
      standingResult.status === "fulfilled" ? standingResult.value : null;
    updateResearchRun(runId, {
      totalExpected: lifetime?.tradeCount ?? null,
    });

    let cursor: string | null = null;
    let fetched = 0;
    let truncated = false;
    while (true) {
      const page = await fetchTradeActivityPage(run.address, cursor, 1_000);
      if (page.rows.length === 0) break;
      fetched += enqueuePage(runId, page.rows);
      updateResearchRun(runId, { progressTrades: fetched });
      if (run.max_trades > 0 && fetched >= run.max_trades) {
        truncated = page.nextCursor != null;
        break;
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
      await sleep(40);
    }

    updateResearchRun(runId, {
      status: "ENRICHING",
      progressTrades: fetched,
      truncated,
    });

    const slugs = listResearchSlugs(runId);
    let enriched = 0;
    for (let index = 0; index < slugs.length; index += 1) {
      const slug = slugs[index];
      const market = getMarket(slug);
      const samples = getSamples(slug);
      const trades = getResearchTradesForSlug(runId, slug);

      for (const trade of trades) {
        const sign = trade.side === "SELL" ? -1 : 1;
        const marketEnd = market?.end_epoch ?? null;
        const fillMid = midAtFill(samples, trade.trade_ts, trade.outcome ?? "UP");
        const m1 = horizonMid(
          samples,
          trade.trade_ts + 1,
          marketEnd,
          trade.outcome ?? "UP",
        );
        const m10 = horizonMid(
          samples,
          trade.trade_ts + 10,
          marketEnd,
          trade.outcome ?? "UP",
        );
        const m60 = horizonMid(
          samples,
          trade.trade_ts + 60,
          marketEnd,
          trade.outcome ?? "UP",
        );
        const endMid =
          marketEnd == null
            ? null
            : (midBefore(
                samples,
                marketEnd,
                trade.outcome ?? "UP",
                END_TOLERANCE,
              ) ??
              midAfter(
                samples,
                marketEnd,
                trade.outcome ?? "UP",
                5,
              ));

        updateResearchTradeEnrichment({
          runId,
          id: trade.id,
          title: market?.title ?? trade.title,
          marketStart: market?.start_epoch ?? null,
          marketEnd,
          resolved: market?.resolved ?? null,
          elapsed:
            market == null ? null : trade.trade_ts - market.start_epoch,
          midAtFill: fillMid,
          mid1s: m1,
          mid10s: m10,
          mid60s: m60,
          midEnd: endMid,
          entryEdge:
            fillMid == null ? null : sign * (fillMid - trade.price),
          markout1s:
            fillMid == null || m1 == null ? null : sign * (m1 - fillMid),
          markout10s:
            fillMid == null || m10 == null ? null : sign * (m10 - fillMid),
          markout60s:
            fillMid == null || m60 == null ? null : sign * (m60 - fillMid),
          markoutEnd:
            fillMid == null || endMid == null
              ? null
              : sign * (endMid - fillMid),
        });
        enriched += 1;
      }

      if (index % 25 === 0 || index === slugs.length - 1) {
        updateResearchRun(runId, {
          enrichedTrades: enriched,
        });
        await sleep(0);
      }
    }

    const redeemRows = await fetchActivityByTypes(
      run.address,
      ["REDEEM", "MAKER_REBATE", "TAKER_REBATE"],
      1_000,
    );

    run = getResearchRun(runId) ?? run;
    const summary = await computeSummary(run, lifetime, standing, redeemRows);
    updateResearchRun(runId, {
      status: "COMPLETE",
      finishedAt: Math.floor(Date.now() / 1000),
      enrichedTrades: enriched,
      summaryJson: JSON.stringify(summary),
      error: null,
    });
    console.log(
      `[research] completed ${run.address}: fetched=${fetched} enriched=${enriched} truncated=${truncated}`,
    );
  } catch (error) {
    console.error("[research] run failed", runId, error);
    updateResearchRun(runId, {
      status: "ERROR",
      finishedAt: Math.floor(Date.now() / 1000),
      error: errorText(error),
    });
  }
}

type GlobalWithResearch = typeof globalThis & {
  __polyklinesResearchWorker?: boolean;
};

const globalStore = globalThis as GlobalWithResearch;

export function startResearchWorker(): void {
  if (globalStore.__polyklinesResearchWorker) return;
  globalStore.__polyklinesResearchWorker = true;
  resetStaleResearchRuns();

  let running = false;
  const run = () => {
    if (running) return;
    const next = claimNextResearchRun();
    if (!next) return;
    running = true;
    processResearchRun(next.id)
      .catch((error) => console.error("[research] worker error", error))
      .finally(() => {
        running = false;
      });
  };

  const initial = setTimeout(run, 5_000);
  (initial as unknown as { unref?: () => void }).unref?.();
  const timer = setInterval(run, 5_000);
  (timer as unknown as { unref?: () => void }).unref?.();
  console.log("[research] trader research worker enabled");
}

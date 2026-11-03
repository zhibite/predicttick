import type {
  LeaderboardActivity,
  LeaderboardClosedPosition,
  LeaderboardDailyPoint,
  LeaderboardMarketStat,
  LeaderboardMetrics,
  LeaderboardPnlPoint,
  LeaderboardPosition,
  LeaderboardSizeBucket,
  TraderLifetimeStats,
  TraderStanding,
} from "./types";

const SIZE_BUCKETS = [
  { label: "< $10", max: 10 },
  { label: "$10 – $100", max: 100 },
  { label: "$100 – $1k", max: 1_000 },
  { label: "$1k – $10k", max: 10_000 },
  { label: "≥ $10k", max: Number.POSITIVE_INFINITY },
];

const WINDOW_SECONDS: Record<string, number> = {
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
  "4h": 14_400,
};

/**
 * Up/Down market slugs encode the window start: `btc-updown-5m-1793662500`.
 * Return the end of that trading window, or null when the slug has no epoch
 * (for example the long-form 1h slugs).
 */
export function marketWindowEnd(
  slug: string | null | undefined,
): number | null {
  if (!slug) return null;
  const match = slug.match(/-(5m|15m|1h|4h)-(\d{10})$/i);
  if (!match) return null;
  const seconds = WINDOW_SECONDS[match[1].toLowerCase()];
  const start = Number(match[2]);
  if (!seconds || !Number.isFinite(start)) return null;
  return start + seconds;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function tradeNotional(trade: LeaderboardActivity): number {
  return trade.usdcSize > 0 ? trade.usdcSize : trade.size * trade.price;
}

function dayKey(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function dayTimestamp(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);
}

function marketKey(row: {
  conditionId: string | null;
  asset: string;
}): string {
  return row.conditionId || row.asset;
}

function estimateHoldingHours(trades: LeaderboardActivity[]): number | null {
  // FIFO matching per token. Only trades inside the fetched window can be
  // matched, so this is an estimate of recent holding time rather than a
  // lifetime number.
  const lots = new Map<
    string,
    Array<{ ts: number; remaining: number }>
  >();
  let weightedSeconds = 0;
  let matchedSize = 0;

  for (const trade of trades) {
    const key = trade.asset || trade.conditionId;
    if (!key) continue;

    if (trade.side === "BUY") {
      const queue = lots.get(key) ?? [];
      queue.push({ ts: trade.timestamp, remaining: trade.size });
      lots.set(key, queue);
      continue;
    }

    if (trade.side !== "SELL") continue;

    let remaining = trade.size;
    const queue = lots.get(key) ?? [];
    while (remaining > 1e-9 && queue.length > 0) {
      const lot = queue[0];
      const taken = Math.min(lot.remaining, remaining);
      weightedSeconds += Math.max(0, trade.timestamp - lot.ts) * taken;
      matchedSize += taken;
      lot.remaining -= taken;
      remaining -= taken;
      if (lot.remaining <= 1e-9) queue.shift();
    }
  }

  if (matchedSize <= 1e-9) return null;
  return weightedSeconds / matchedSize / 3600;
}

function currentStreak(closed: LeaderboardClosedPosition[]): number {
  let streak = 0;
  for (let index = closed.length - 1; index >= 0; index -= 1) {
    const pnl = closed[index].realizedPnl;
    if (pnl === 0) break;
    const sign = pnl > 0 ? 1 : -1;
    if (streak === 0) {
      streak = sign;
    } else if (Math.sign(streak) === sign) {
      streak += sign;
    } else {
      break;
    }
  }
  return streak;
}

function buildTopMarkets(input: {
  positions: LeaderboardPosition[];
  closedPositions: LeaderboardClosedPosition[];
  trades: LeaderboardActivity[];
}): LeaderboardMarketStat[] {
  const markets = new Map<string, LeaderboardMarketStat>();

  const ensure = (row: {
    conditionId: string | null;
    asset: string;
    title: string | null;
    slug: string | null;
    eventSlug: string | null;
  }): LeaderboardMarketStat => {
    const key = marketKey(row);
    let stat = markets.get(key);
    if (!stat) {
      stat = {
        key,
        title: row.title ?? "Unknown market",
        slug: row.slug,
        eventSlug: row.eventSlug,
        volume: 0,
        trades: 0,
        realizedPnl: 0,
        openValue: 0,
        unrealizedPnl: 0,
      };
      markets.set(key, stat);
    }
    if (stat.title === "Unknown market" && row.title) stat.title = row.title;
    stat.slug ??= row.slug;
    stat.eventSlug ??= row.eventSlug;
    return stat;
  };

  for (const trade of input.trades) {
    const stat = ensure(trade);
    stat.volume += tradeNotional(trade);
    stat.trades += 1;
  }
  for (const closed of input.closedPositions) {
    ensure(closed).realizedPnl += closed.realizedPnl;
  }
  for (const position of input.positions) {
    const stat = ensure(position);
    stat.openValue += position.currentValue;
    stat.unrealizedPnl += position.cashPnl;
  }

  return [...markets.values()]
    .filter(
      (market) =>
        market.volume > 0 ||
        market.realizedPnl !== 0 ||
        market.openValue > 0,
    )
    .sort(
      (a, b) =>
        b.volume - a.volume || b.realizedPnl - a.realizedPnl,
    )
    .slice(0, 8);
}

export function computeLeaderboardMetrics(input: {
  positions: LeaderboardPosition[];
  closedPositions: LeaderboardClosedPosition[];
  trades: LeaderboardActivity[];
  portfolioValue: number | null;
  lifetime?: TraderLifetimeStats | null;
  standing?: TraderStanding | null;
  now?: number;
}): LeaderboardMetrics {
  const { positions, trades, portfolioValue } = input;
  const closed = [...input.closedPositions].sort(
    (a, b) => a.closedAt - b.closedAt,
  );
  const sortedTrades = [...trades].sort(
    (a, b) => a.timestamp - b.timestamp,
  );

  const realizedPnl = sum(closed.map((position) => position.realizedPnl));
  const unrealizedPnl = sum(positions.map((position) => position.cashPnl));
  const openValue = sum(positions.map((position) => position.currentValue));
  const initialValue = sum(positions.map((position) => position.initialValue));

  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let largestWin = 0;
  let largestLoss = 0;
  let closedCost = 0;

  for (const position of closed) {
    const pnl = position.realizedPnl;
    // `totalBought` is a share count, not USD; the cost basis is shares ×
    // average entry price.
    const cost =
      position.avgPrice > 0
        ? Math.abs(position.totalBought) * position.avgPrice
        : 0;
    closedCost += cost;
    if (pnl > 0) {
      wins += 1;
      grossProfit += pnl;
      largestWin = Math.max(largestWin, pnl);
    } else if (pnl < 0) {
      losses += 1;
      grossLoss += Math.abs(pnl);
      largestLoss = Math.min(largestLoss, pnl);
    }
  }

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const position of closed) {
    cumulative += position.realizedPnl;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  // Holding time from closed positions is more reliable than FIFO on the
  // fetched trade window, especially for market makers that exit by
  // redemption instead of SELL orders. For short-window markets, cap the
  // exit at the market's resolution time so late redemptions do not inflate
  // the trading exposure.
  const holdSamples = closed
    .filter(
      (position) =>
        position.firstEntryAt > 0 &&
        position.closedAt > position.firstEntryAt,
    )
    .map((position) => {
      const windowEnd = marketWindowEnd(position.slug);
      const end =
        windowEnd != null && windowEnd > position.firstEntryAt
          ? Math.min(position.closedAt, windowEnd)
          : position.closedAt;
      return {
        hours: (end - position.firstEntryAt) / 3600,
        weight: Math.max(
          0.0001,
          Math.abs(position.totalBought) * Math.max(0, position.avgPrice),
        ),
        pnl: position.realizedPnl,
      };
    })
    .filter((sample) => sample.hours >= 0 && sample.hours < 24 * 365 * 5);
  let closedHoldingHours: number | null = null;
  let closedHoldingMedianHours: number | null = null;
  if (holdSamples.length > 0) {
    const totalWeight = holdSamples.reduce(
      (total, sample) => total + sample.weight,
      0,
    );
    closedHoldingHours =
      holdSamples.reduce(
        (total, sample) => total + sample.hours * sample.weight,
        0,
      ) / totalWeight;
    const sortedByHours = [...holdSamples].sort(
      (a, b) => a.hours - b.hours,
    );
    closedHoldingMedianHours =
      sortedByHours[Math.floor(sortedByHours.length * 0.5)]?.hours ?? null;
  }

  let volume = 0;
  let buyVolume = 0;
  let sellVolume = 0;
  let buyCount = 0;
  let sellCount = 0;
  const hourly = Array<number>(24).fill(0);
  const activeDays = new Set<string>();
  const markets = new Set<string>();
  const buckets: LeaderboardSizeBucket[] = SIZE_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: 0,
    volume: 0,
  }));

  for (const trade of sortedTrades) {
    const notional = tradeNotional(trade);
    volume += notional;

    if (trade.side === "BUY") {
      buyVolume += notional;
      buyCount += 1;
    } else if (trade.side === "SELL") {
      sellVolume += notional;
      sellCount += 1;
    }

    hourly[new Date(trade.timestamp * 1000).getUTCHours()] += 1;
    activeDays.add(dayKey(trade.timestamp));
    markets.add(marketKey(trade));

    const index = SIZE_BUCKETS.findIndex(
      (bucket) => notional < bucket.max,
    );
    const bucket = buckets[index === -1 ? buckets.length - 1 : index];
    bucket.count += 1;
    bucket.volume += notional;
  }

  for (const position of positions) markets.add(marketKey(position));
  for (const position of closed) markets.add(marketKey(position));

  const tradeCount = sortedTrades.length;
  const decided = wins + losses;
  const avgWin = wins > 0 ? grossProfit / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;

  return {
    totalPnl: realizedPnl + unrealizedPnl,
    realizedPnl,
    unrealizedPnl,
    positionsValue: portfolioValue ?? openValue,
    initialValue,
    volume,
    tradeCount,
    buyVolume,
    sellVolume,
    buyCount,
    sellCount,
    closedCount: closed.length,
    wins,
    losses,
    winRate: decided > 0 ? (wins / decided) * 100 : null,
    roi:
      closedCost > 0
        ? (realizedPnl / closedCost) * 100
        : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    avgWin,
    avgLoss,
    avgTradeSize: tradeCount > 0 ? volume / tradeCount : 0,
    largestWin,
    largestLoss,
    maxDrawdown,
    marketsTraded: markets.size,
    openPositions: positions.length,
    firstTradeAt:
      sortedTrades.length > 0 ? sortedTrades[0].timestamp : null,
    lastTradeAt:
      sortedTrades.length > 0
        ? sortedTrades[sortedTrades.length - 1].timestamp
        : null,
    activeDays: activeDays.size,
    currentStreak: currentStreak(closed),
    holdingHours: estimateHoldingHours(sortedTrades),
    closedHoldingHours,
    closedHoldingMedianHours,
    closedHoldingSample: holdSamples.length,
    hourly,
    sizeBuckets: buckets,
    topMarkets: buildTopMarkets(input),
    fetchedTrades: sortedTrades.length,
    fetchedClosed: closed.length,
    lifetime: input.lifetime ?? null,
    standing: input.standing ?? null,
    updatedAt: input.now ?? Math.floor(Date.now() / 1000),
  };
}

export function buildPnlSeries(
  closedPositions: LeaderboardClosedPosition[],
): LeaderboardPnlPoint[] {
  const byDay = new Map<string, number>();
  for (const position of closedPositions) {
    if (position.closedAt <= 0) continue;
    const day = dayKey(position.closedAt);
    byDay.set(day, (byDay.get(day) ?? 0) + position.realizedPnl);
  }

  const points: LeaderboardPnlPoint[] = [];
  let cumulative = 0;
  for (const day of [...byDay.keys()].sort()) {
    cumulative += byDay.get(day) ?? 0;
    points.push({
      t: dayTimestamp(day),
      cumPnl: Math.round(cumulative * 100) / 100,
    });
  }
  return points;
}

export function buildDailySeries(
  trades: LeaderboardActivity[],
  closedPositions: LeaderboardClosedPosition[],
  limit = 120,
): LeaderboardDailyPoint[] {
  const byDay = new Map<string, LeaderboardDailyPoint>();

  const ensure = (day: string): LeaderboardDailyPoint => {
    let point = byDay.get(day);
    if (!point) {
      point = { day, volume: 0, trades: 0, realizedPnl: 0 };
      byDay.set(day, point);
    }
    return point;
  };

  for (const trade of trades) {
    if (trade.timestamp <= 0) continue;
    const point = ensure(dayKey(trade.timestamp));
    point.volume += tradeNotional(trade);
    point.trades += 1;
  }
  for (const closed of closedPositions) {
    if (closed.closedAt <= 0) continue;
    ensure(dayKey(closed.closedAt)).realizedPnl += closed.realizedPnl;
  }

  return [...byDay.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-limit);
}

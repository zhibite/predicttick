import type { ReactNode } from "react";

import type { LeaderboardMetrics } from "@/server/leaderboard/types";
import {
  formatAge,
  formatSignedUsd,
  formatUsd,
  formatUsdCompact,
  pnlTextClass,
} from "@/lib/leaderboard-format";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
        {title}
      </h3>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FlowRow({
  label,
  count,
  volume,
  share,
  color,
}: {
  label: string;
  count: number;
  volume: number;
  share: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {label}
        </span>
        <span className="tabular-nums text-gray-500 dark:text-gray-400">
          {count.toLocaleString("en-US")} trades · {formatUsdCompact(volume)}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.max(share * 100, volume > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass = "text-gray-800 dark:text-white/90",
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className={`mt-1 text-sm font-medium tabular-nums ${valueClass}`}>
        {value}
      </dd>
    </div>
  );
}

export default function TraderBehavior({
  metrics,
}: {
  metrics: LeaderboardMetrics;
}) {
  const totalFlowVolume = metrics.buyVolume + metrics.sellVolume;
  const buyShare = totalFlowVolume > 0 ? metrics.buyVolume / totalFlowVolume : 0;
  const sellShare =
    totalFlowVolume > 0 ? metrics.sellVolume / totalFlowVolume : 0;
  const maxHourly = Math.max(1, ...metrics.hourly);
  const maxBucketCount = Math.max(
    1,
    ...metrics.sizeBuckets.map((bucket) => bucket.count),
  );
  const peakHour =
    maxHourly > 0 ? metrics.hourly.indexOf(maxHourly) : -1;
  const streak =
    metrics.currentStreak > 0
      ? `${metrics.currentStreak} win${metrics.currentStreak === 1 ? "" : "s"}`
      : metrics.currentStreak < 0
        ? `${Math.abs(metrics.currentStreak)} loss${metrics.currentStreak === -1 ? "" : "es"}`
        : "—";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section
          title="Trade flow"
          hint="Buy versus sell notional across the fetched trade window."
        >
          <div className="space-y-4">
            <FlowRow
              label="Buy"
              count={metrics.buyCount}
              volume={metrics.buyVolume}
              share={buyShare}
              color="bg-success-500"
            />
            <FlowRow
              label="Sell"
              count={metrics.sellCount}
              volume={metrics.sellVolume}
              share={sellShare}
              color="bg-error-500"
            />
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            <Stat label="Buy share" value={`${(buyShare * 100).toFixed(1)}%`} />
            <Stat
              label="Sell share"
              value={`${(sellShare * 100).toFixed(1)}%`}
            />
            <Stat
              label="Avg trade size"
              value={formatUsd(metrics.avgTradeSize)}
            />
            <Stat
              label="Trades fetched"
              value={metrics.fetchedTrades.toLocaleString("en-US")}
            />
          </dl>
        </Section>

        <Section
          title="Activity by UTC hour"
          hint={`Peak hour: ${peakHour === -1 ? "—" : `${String(peakHour).padStart(2, "0")}:00 UTC`} · ${maxHourly} trades`}
        >
          <div className="flex h-28 items-end gap-1">
            {metrics.hourly.map((count, hour) => (
              <div
                key={hour}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                title={`${String(hour).padStart(2, "0")}:00 UTC · ${count} trades`}
              >
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t ${
                      count > 0
                        ? "bg-brand-500/80"
                        : "bg-gray-100 dark:bg-white/5"
                    }`}
                    style={{
                      height: `${count > 0 ? Math.max(4, (count / maxHourly) * 100) : 2}%`,
                    }}
                  />
                </div>
                <span className="text-[9px] text-gray-400">
                  {hour % 3 === 0 ? hour : "·"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Counts include every fetched buy and sell; UTC aligns with
            Polymarket settlement windows.
          </p>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section
          title="Trade size distribution"
          hint="Notional per trade in the fetched activity window."
        >
          {metrics.tradeCount === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No trades were returned for this trader.
            </p>
          ) : (
            <div className="space-y-3">
              {metrics.sizeBuckets.map((bucket) => (
                <div key={bucket.label}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {bucket.label}
                    </span>
                    <span className="tabular-nums text-gray-500 dark:text-gray-400">
                      {bucket.count.toLocaleString("en-US")} ·{" "}
                      {formatUsdCompact(bucket.volume)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{
                        width: `${bucket.count > 0 ? Math.max(2, (bucket.count / maxBucketCount) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Execution profile"
          hint="Closed-position outcomes and the fetched trade window."
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Stat
              label="Largest win"
              value={formatSignedUsd(metrics.largestWin)}
              valueClass={pnlTextClass(metrics.largestWin)}
            />
            <Stat
              label="Largest loss"
              value={formatSignedUsd(metrics.largestLoss)}
              valueClass={pnlTextClass(metrics.largestLoss)}
            />
            <Stat
              label="Profit factor"
              value={
                metrics.profitFactor == null
                  ? metrics.realizedPnl > 0
                    ? "No losses"
                    : "—"
                  : metrics.profitFactor.toFixed(2)
              }
            />
            <Stat
              label="Max realized drawdown"
              value={formatUsd(metrics.maxDrawdown)}
              valueClass="text-error-600 dark:text-error-400"
            />
            <Stat label="Current streak" value={streak} />
            <Stat
              label="Median holding time"
              value={
                metrics.closedHoldingMedianHours != null
                  ? `${metrics.closedHoldingMedianHours.toFixed(2)}h`
                  : metrics.holdingHours == null
                    ? "—"
                    : `${metrics.holdingHours.toFixed(2)}h`
              }
            />
            <Stat
              label="Active days"
              value={metrics.activeDays.toLocaleString("en-US")}
            />
            <Stat
              label="Markets traded"
              value={metrics.marketsTraded.toLocaleString("en-US")}
            />
            <Stat
              label="First trade"
              value={
                metrics.firstTradeAt
                  ? formatAge(metrics.firstTradeAt)
                  : "—"
              }
            />
            <Stat
              label="Last trade"
              value={metrics.lastTradeAt ? formatAge(metrics.lastTradeAt) : "—"}
            />
            <Stat
              label="Closed positions"
              value={metrics.closedCount.toLocaleString("en-US")}
            />
            <Stat
              label="Data window"
              value={`${metrics.fetchedTrades.toLocaleString("en-US")} trades`}
            />
          </dl>
          <p className="mt-4 text-xs text-gray-400">
            Median holding time uses each closed position&apos;s first entry
            until market resolution when the slug encodes it, otherwise until
            the last event ({metrics.closedHoldingSample} samples; cost-weighted
            average{" "}
            {metrics.closedHoldingHours == null
              ? "—"
              : `${metrics.closedHoldingHours.toFixed(2)}h`}
            ). FIFO on the fetched SELL window gives{" "}
            {metrics.holdingHours == null
              ? "—"
              : `${metrics.holdingHours.toFixed(2)}h`}
            ; positions exited by redemption have no SELL leg.
          </p>
        </Section>
      </div>

      <Section
        title="Top markets"
        hint="Ranked by fetched trade notional, with realized PnL from closed positions."
      >
        {metrics.topMarkets.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No market activity was returned.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="py-2 pr-4 text-left font-medium">Market</th>
                  <th className="px-4 py-2 text-right font-medium">Volume</th>
                  <th className="px-4 py-2 text-right font-medium">Trades</th>
                  <th className="px-4 py-2 text-right font-medium">
                    Realized PnL
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    Open value
                  </th>
                </tr>
              </thead>
              <tbody>
                {metrics.topMarkets.map((market) => {
                  const eventSlug = market.eventSlug ?? market.slug;
                  return (
                    <tr
                      key={market.key}
                      className="border-t border-gray-100 dark:border-gray-800"
                    >
                      <td className="max-w-[320px] py-3 pr-4">
                        {eventSlug ? (
                          <a
                            href={`https://polymarket.com/event/${eventSlug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="line-clamp-2 text-gray-700 hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-400"
                          >
                            {market.title}
                          </a>
                        ) : (
                          <span className="line-clamp-2 text-gray-700 dark:text-gray-300">
                            {market.title}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                        {formatUsdCompact(market.volume)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                        {market.trades.toLocaleString("en-US")}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums ${pnlTextClass(market.realizedPnl)}`}
                      >
                        {formatSignedUsd(market.realizedPnl)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                        {formatUsd(market.openValue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

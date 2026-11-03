import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import TraderBehavior from "@/components/leaderboard/TraderBehavior";
import TraderCharts from "@/components/leaderboard/TraderCharts";
import TraderTables from "@/components/leaderboard/TraderTables";
import { getCurrentUser } from "@/server/auth";
import {
  getLeaderboardEntryByAddress,
  getTraderDetail,
} from "@/server/leaderboard/store";
import {
  formatAge,
  formatEpochUtc,
  formatPercentPoints,
  formatSignedUsd,
  formatUsd,
  formatUsdCompact,
  pnlTextClass,
} from "@/lib/leaderboard-format";

export const dynamic = "force-dynamic";

interface TraderPageProps {
  params: Promise<{ address: string }>;
}

export async function generateMetadata({
  params,
}: TraderPageProps): Promise<Metadata> {
  const { address } = await params;
  const entry = getLeaderboardEntryByAddress(address);
  if (!entry?.active) {
    return {
      title: "Trader analysis | PolyKlines",
      description: "Polymarket trader analysis.",
      robots: { index: false },
    };
  }
  return {
    title: `${entry.displayName} | Polymarket trader analysis | PolyKlines`,
    description: `Trading behaviour, PnL, volume, win rate and open positions for ${entry.displayName} on Polymarket.`,
  };
}

function MetricCard({
  label,
  value,
  hint,
  valueClass = "text-gray-800 dark:text-white/90",
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export default async function TraderPage({ params }: TraderPageProps) {
  const { address } = await params;
  const detail = getTraderDetail(address);
  if (!detail) notFound();

  const viewer = await getCurrentUser();
  if (!detail.user.active && viewer?.role !== "admin") notFound();

  const { user, metrics, pnlSeries, daily, positions, closedPositions, activity } =
    detail;
  const profileUrl = `https://polymarket.com/profile/${user.address}`;
  const lifetime = metrics.lifetime;
  const standing = metrics.standing;
  const displayPnl = lifetime?.positionPnl ?? metrics.totalPnl;
  const displayVolume = lifetime?.volumeUsd ?? metrics.volume;
  const displayTrades = lifetime?.tradeCount ?? metrics.tradeCount;
  const displayMarkets = lifetime?.marketsTraded ?? metrics.marketsTraded;
  const avgFill =
    displayTrades > 0 ? displayVolume / displayTrades : metrics.avgTradeSize;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/leaderboard"
          className="text-sm text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400"
        >
          ← Back to leaderboard
        </Link>
      </div>
      <PageBreadcrumb pageTitle="Trader analysis" />

      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              referrerPolicy="no-referrer"
              className="h-16 w-16 shrink-0 rounded-full bg-gray-100 object-cover dark:bg-white/10"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xl font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
              {user.displayName.slice(0, 1).toUpperCase()}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold text-gray-800 dark:text-white/90">
                {user.displayName}
              </h2>
              {user.pseudonym &&
                user.pseudonym !== user.displayName && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    @{user.pseudonym}
                  </span>
                )}
              {!user.active && (
                <span className="rounded-full bg-warning-50 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                  Inactive · admin preview
                </span>
              )}
              {standing?.rankPnl != null && (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:bg-white/10 dark:text-gray-300">
                  #{standing.rankPnl} all-time PnL
                </span>
              )}
            </div>
            <p className="mt-1 break-all font-mono text-xs text-gray-400">
              {user.address}
            </p>
            {user.bio && (
              <p className="mt-3 max-w-3xl whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">
                {user.bio}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-1 text-xs text-gray-400 sm:items-end">
            <a
              href={profileUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-500 hover:text-brand-600"
            >
              Polymarket profile ↗
            </a>
            <span>Synced {formatAge(user.lastSyncedAt)}</span>
            <span>{formatEpochUtc(user.lastSyncedAt)}</span>
            {lifetime?.joinDate != null && (
              <span>Joined {formatEpochUtc(lifetime.joinDate)}</span>
            )}
            <span className="uppercase tracking-wide">
              {user.syncStatus}
            </span>
          </div>
        </div>
      </div>

      {user.lastSyncError && (
        <div className="mt-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          Last sync error: {user.lastSyncError}
        </div>
      )}
      {user.lastSyncWarning && (
        <div className="mt-4 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
          Partial sync warning: {user.lastSyncWarning}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={lifetime ? "Lifetime PnL" : "Sample PnL"}
          value={formatSignedUsd(displayPnl)}
          hint={
            lifetime
              ? `${formatSignedUsd(lifetime.realizedPnl)} realized · ${formatSignedUsd(lifetime.unrealizedPnl)} open`
              : `${formatSignedUsd(metrics.realizedPnl)} realized · ${formatSignedUsd(metrics.unrealizedPnl)} open`
          }
          valueClass={pnlTextClass(displayPnl)}
        />
        <MetricCard
          label="Lifetime economic PnL"
          value={lifetime ? formatSignedUsd(lifetime.economicPnl) : "—"}
          hint={
            lifetime
              ? `incl. ${formatUsd(lifetime.makerRebate + lifetime.takerRebate)} rebates`
              : "user-stats unavailable"
          }
          valueClass={pnlTextClass(lifetime?.economicPnl)}
        />
        <MetricCard
          label={lifetime ? "Lifetime volume" : "Sample volume"}
          value={formatUsdCompact(displayVolume)}
          hint={`${displayTrades.toLocaleString("en-US")} fills · avg ${formatUsd(avgFill)}`}
        />
        <MetricCard
          label="Open positions value"
          value={formatUsd(metrics.positionsValue)}
          hint={`${metrics.openPositions} open · ${formatUsd(metrics.initialValue)} cost`}
        />
        <MetricCard
          label="Win rate (sample)"
          value={formatPercentPoints(metrics.winRate)}
          hint={`${metrics.wins} wins / ${metrics.losses} losses`}
        />
        <MetricCard
          label="ROI on closed (sample)"
          value={formatPercentPoints(metrics.roi)}
          hint={`${metrics.closedCount} closed positions`}
          valueClass={pnlTextClass(metrics.roi)}
        />
        <MetricCard
          label="Profit factor (sample)"
          value={
            metrics.profitFactor == null
              ? metrics.realizedPnl > 0
                ? "No losses"
                : "—"
              : metrics.profitFactor.toFixed(2)
          }
          hint={`avg win ${formatUsd(metrics.avgWin)} · avg loss ${formatUsd(metrics.avgLoss)}`}
        />
        <MetricCard
          label="Max realized drawdown (sample)"
          value={formatUsd(metrics.maxDrawdown)}
          hint="peak-to-trough on closed PnL"
          valueClass="text-error-600 dark:text-error-400"
        />
        <MetricCard
          label="Markets traded"
          value={displayMarkets.toLocaleString("en-US")}
          hint={
            lifetime?.joinDate
              ? `joined ${formatEpochUtc(lifetime.joinDate)}`
              : `${metrics.activeDays} active days in sample`
          }
        />
        <MetricCard
          label="All-time fills"
          value={displayTrades.toLocaleString("en-US")}
          hint={`avg fill ${formatUsd(avgFill)}`}
        />
        <MetricCard
          label="All-time rank"
          value={
            standing?.rankPnl != null
              ? `#${standing.rankPnl}`
              : "—"
          }
          hint={
            standing?.rankVolume != null
              ? `#${standing.rankVolume} by volume`
              : "leaderboard standing unavailable"
          }
        />
        <MetricCard
          label="Maker rebates"
          value={lifetime ? formatUsd(lifetime.makerRebate) : "—"}
          hint={
            lifetime
              ? `fees ${formatUsd(lifetime.feesPaid)} · taker ${formatUsd(lifetime.takerRebate)}`
              : "user-stats unavailable"
          }
          valueClass={pnlTextClass(lifetime?.makerRebate)}
        />
      </div>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
          Performance
        </h2>
        <p className="mt-1 text-xs text-gray-400">
          Built from the latest closed-position and trade sample. Lifetime
          totals above come from Polymarket&apos;s user-statistics endpoint.
        </p>
        <div className="mt-4">
          <TraderCharts pnlSeries={pnlSeries} daily={daily} />
        </div>
      </section>

      <div className="mt-8">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-white/90">
          Trading behaviour
        </h2>
        <TraderBehavior metrics={metrics} />
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-white/90">
          Positions and trades
        </h2>
        <TraderTables
          positions={positions}
          closedPositions={closedPositions}
          activity={activity}
        />
      </div>

      <div className="mt-6 space-y-1 text-xs text-gray-400">
        <p>
          Source: Polymarket Data API v2 (positions, activity, portfolio value,
          user statistics, leaderboard standing) and Gamma API (public
          profile). Last synced {formatEpochUtc(user.lastSyncedAt)}.
        </p>
        <p>
          Lifetime PnL, volume, fills and rank come from Polymarket&apos;s
          user-statistics and leaderboard endpoints. Win rate, ROI, drawdown,
          holding time and Top markets use the newest{" "}
          {process.env.POLY_LEADERBOARD_MAX_TRADES ?? "1000"} trades and{" "}
          {process.env.POLY_LEADERBOARD_MAX_CLOSED ?? "500"} closed positions,
          so those figures are sample-based. Past performance does not
          guarantee future results.
        </p>
      </div>
    </div>
  );
}

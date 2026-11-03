import type { Metadata } from "next";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import LeaderboardTable, {
  isLeaderboardSort,
} from "@/components/leaderboard/LeaderboardTable";
import { listLeaderboardEntries } from "@/server/leaderboard/store";
import {
  formatAge,
  formatEpochUtc,
  formatSignedUsd,
  formatUsdCompact,
  pnlTextClass,
} from "@/lib/leaderboard-format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trader leaderboard | PolyKlines",
  description:
    "Manually curated Polymarket traders ranked by PnL, volume, win rate and open position value.",
};

interface LeaderboardPageProps {
  searchParams: Promise<{ sort?: string }>;
}

export default async function LeaderboardPage({
  searchParams,
}: LeaderboardPageProps) {
  const params = await searchParams;
  const sort = isLeaderboardSort(params.sort) ? params.sort : "pnl";
  const entries = listLeaderboardEntries(false);

  const totals = entries.reduce(
    (accumulator, entry) => {
      if (!entry.metrics) return accumulator;
      accumulator.pnl +=
        entry.metrics.lifetime?.positionPnl ?? entry.metrics.totalPnl;
      accumulator.volume +=
        entry.metrics.lifetime?.volumeUsd ?? entry.metrics.volume;
      accumulator.openValue += entry.metrics.positionsValue;
      return accumulator;
    },
    { pnl: 0, volume: 0, openValue: 0 },
  );

  const lastSync = entries.reduce<number | null>(
    (latest, entry) =>
      entry.lastSyncedAt != null &&
      (latest == null || entry.lastSyncedAt > latest)
        ? entry.lastSyncedAt
        : latest,
    null,
  );

  return (
    <div>
      <PageBreadcrumb pageTitle="Trader leaderboard" />
      <p className="mb-6 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        A manually curated list of Polymarket traders. Metrics are rebuilt from
        Polymarket&apos;s public Data and Gamma APIs: realized PnL comes from
        closed positions, unrealized PnL and open value from current positions,
        and volume / win rate / trade counts from the latest fetched activity.
        Open any trader for a full behaviour breakdown.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Tracked traders
          </p>
          <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {entries.length}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {entries.filter((entry) => entry.metrics).length} synced ·{" "}
            {entries.filter((entry) => entry.syncStatus === "error").length}{" "}
            failed
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Combined PnL
          </p>
          <p
            className={`mt-2 text-2xl font-semibold ${pnlTextClass(totals.pnl)}`}
          >
            {formatSignedUsd(totals.pnl)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            realized + unrealized
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Recent volume
          </p>
          <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {formatUsdCompact(totals.volume)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {formatUsdCompact(totals.openValue)} open value
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">Last sync</p>
          <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {formatAge(lastSync)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {formatEpochUtc(lastSync)}
          </p>
        </div>
      </div>

      <LeaderboardTable entries={entries} sort={sort} />

      <div className="mt-4 space-y-1 text-xs text-gray-400">
        <p>
          PnL, volume, trade count and markets use Polymarket&apos;s lifetime
          user stats when available. Win rate, ROI, profit factor and the
          behaviour breakdown use the latest closed-position and trade sample
          (up to {process.env.POLY_LEADERBOARD_MAX_CLOSED ?? "500"} closed
          positions and {process.env.POLY_LEADERBOARD_MAX_TRADES ?? "1000"}{" "}
          trades per trader).
        </p>
        <p>
          Background refresh runs every{" "}
          {process.env.POLY_LEADERBOARD_SYNC_MINUTES ?? "30"} minutes. Values
          are not investment advice.
        </p>
      </div>
    </div>
  );
}

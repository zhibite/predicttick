import Link from "next/link";

import type { LeaderboardEntry } from "@/server/leaderboard/types";
import {
  formatAge,
  formatPercentPoints,
  formatSignedUsd,
  formatUsd,
  formatUsdCompact,
  pnlTextClass,
  shortAddress,
} from "@/lib/leaderboard-format";

export const LEADERBOARD_SORTS = [
  "pnl",
  "volume",
  "winRate",
  "roi",
  "trades",
  "value",
] as const;

export type LeaderboardSort = (typeof LEADERBOARD_SORTS)[number];

const SORT_LABELS: Record<LeaderboardSort, string> = {
  pnl: "PnL",
  volume: "Volume",
  winRate: "Win rate",
  roi: "ROI",
  trades: "Trades",
  value: "Open value",
};

export function isLeaderboardSort(
  value: string | undefined,
): value is LeaderboardSort {
  return LEADERBOARD_SORTS.includes(value as LeaderboardSort);
}

function metricValue(
  entry: LeaderboardEntry,
  sort: LeaderboardSort,
): number | null {
  const metrics = entry.metrics;
  if (!metrics) return null;
  switch (sort) {
    case "pnl":
      return metrics.lifetime?.positionPnl ?? metrics.totalPnl;
    case "volume":
      return metrics.lifetime?.volumeUsd ?? metrics.volume;
    case "winRate":
      return metrics.winRate;
    case "roi":
      return metrics.roi;
    case "trades":
      return metrics.lifetime?.tradeCount ?? metrics.tradeCount;
    case "value":
      return metrics.positionsValue;
  }
}

export function sortLeaderboardEntries(
  entries: LeaderboardEntry[],
  sort: LeaderboardSort,
): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    const left = metricValue(a, sort);
    const right = metricValue(b, sort);
    if (left == null && right == null) {
      return a.displayName.localeCompare(b.displayName);
    }
    if (left == null) return 1;
    if (right == null) return -1;
    if (right !== left) return right - left;
    return (b.metrics?.volume ?? 0) - (a.metrics?.volume ?? 0);
  });
}

function SortHeader({
  label,
  value,
  active,
}: {
  label: string;
  value: LeaderboardSort;
  active: boolean;
}) {
  return (
    <Link
      href={`/leaderboard?sort=${value}`}
      className={`inline-flex items-center gap-1 ${
        active
          ? "text-brand-600 dark:text-brand-400"
          : "hover:text-gray-700 dark:hover:text-gray-200"
      }`}
    >
      {label}
      <span className={active ? "opacity-100" : "opacity-30"}>↓</span>
    </Link>
  );
}

function TraderAvatar({ entry }: { entry: LeaderboardEntry }) {
  if (entry.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={entry.image}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-10 w-10 shrink-0 rounded-full bg-gray-100 object-cover dark:bg-white/10"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
      {entry.displayName.slice(0, 1).toUpperCase()}
    </span>
  );
}

function SyncNote({ entry }: { entry: LeaderboardEntry }) {
  if (entry.metrics) return null;
  const label =
    entry.syncStatus === "error"
      ? "Sync failed"
      : entry.syncStatus === "syncing"
        ? "Syncing…"
        : "Waiting for first sync";
  return (
    <span
      className={`text-[11px] ${
        entry.syncStatus === "error"
          ? "text-error-600 dark:text-error-400"
          : "text-gray-400"
      }`}
    >
      {label}
    </span>
  );
}

export default function LeaderboardTable({
  entries,
  sort,
}: {
  entries: LeaderboardEntry[];
  sort: LeaderboardSort;
}) {
  const sorted = sortLeaderboardEntries(entries, sort);

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center dark:border-gray-700">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          No traders are tracked yet.
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          An administrator can add manually curated Polymarket addresses in
          Admin → Leaderboard addresses.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
      <table className="min-w-[1080px] w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
          <tr>
            <th className="w-14 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide">
              #
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide">
              Trader
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">
              <SortHeader
                label={SORT_LABELS.pnl}
                value="pnl"
                active={sort === "pnl"}
              />
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">
              <SortHeader
                label={SORT_LABELS.volume}
                value="volume"
                active={sort === "volume"}
              />
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">
              <SortHeader
                label={SORT_LABELS.winRate}
                value="winRate"
                active={sort === "winRate"}
              />
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">
              <SortHeader
                label={SORT_LABELS.roi}
                value="roi"
                active={sort === "roi"}
              />
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">
              <SortHeader
                label={SORT_LABELS.trades}
                value="trades"
                active={sort === "trades"}
              />
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">
              <SortHeader
                label={SORT_LABELS.value}
                value="value"
                active={sort === "value"}
              />
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">
              Last trade
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, index) => {
            const metrics = entry.metrics;
            const lifetime = metrics?.lifetime ?? null;
            const displayPnl = lifetime?.positionPnl ?? metrics?.totalPnl;
            return (
              <tr
                key={entry.id}
                className="border-t border-gray-100 hover:bg-gray-50/70 dark:border-gray-800 dark:hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3 text-left">
                  <span
                    className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                      index === 0
                        ? "bg-warning-100 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400"
                        : index === 1
                          ? "bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300"
                          : index === 2
                            ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400"
                            : "text-gray-400"
                    }`}
                  >
                    {index + 1}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <TraderAvatar entry={entry} />
                    <div className="min-w-0">
                      <Link
                        href={`/leaderboard/${entry.address}`}
                        className="block truncate font-medium text-gray-800 hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-400"
                      >
                        {entry.displayName}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-400">
                        {entry.pseudonym &&
                          entry.pseudonym !== entry.displayName && (
                            <span className="truncate">
                              @{entry.pseudonym}
                            </span>
                          )}
                        <span className="font-mono">
                          {shortAddress(entry.address)}
                        </span>
                        {entry.label && (
                          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                            tracked
                          </span>
                        )}
                        {metrics?.standing?.rankPnl != null && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-white/10 dark:text-gray-400">
                            #{metrics.standing.rankPnl} PnL
                          </span>
                        )}
                      </div>
                      <SyncNote entry={entry} />
                    </div>
                  </div>
                </td>
                <td
                  className={`px-4 py-3 text-right font-medium tabular-nums ${pnlTextClass(
                    displayPnl,
                  )}`}
                >
                  {formatSignedUsd(displayPnl)}
                  {lifetime ? (
                    <span className="mt-0.5 block text-[11px] font-normal text-gray-400">
                      {formatSignedUsd(lifetime.realizedPnl)} realized ·{" "}
                      {formatSignedUsd(lifetime.unrealizedPnl)} open
                    </span>
                  ) : (
                    metrics && (
                      <span className="mt-0.5 block text-[11px] font-normal text-gray-400">
                        {formatSignedUsd(metrics.unrealizedPnl)} open
                      </span>
                    )
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                  {formatUsdCompact(
                    lifetime?.volumeUsd ?? metrics?.volume,
                  )}
                  {lifetime && lifetime.tradeCount > 0 && (
                    <span className="mt-0.5 block text-[11px] text-gray-400">
                      avg {formatUsd(lifetime.volumeUsd / lifetime.tradeCount)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                  {formatPercentPoints(metrics?.winRate)}
                  {metrics && (
                    <span className="mt-0.5 block text-[11px] text-gray-400">
                      {metrics.wins}W / {metrics.losses}L
                    </span>
                  )}
                </td>
                <td
                  className={`px-4 py-3 text-right tabular-nums ${pnlTextClass(
                    metrics?.roi,
                  )}`}
                >
                  {formatPercentPoints(metrics?.roi)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                  {(
                    lifetime?.tradeCount ?? metrics?.tradeCount
                  )?.toLocaleString("en-US") ?? "—"}
                  <span className="mt-0.5 block text-[11px] text-gray-400">
                    {(lifetime?.marketsTraded ?? metrics?.marketsTraded)?.toLocaleString(
                      "en-US",
                    ) ?? "—"}{" "}
                    markets
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                  {formatUsd(metrics?.positionsValue)}
                </td>
                <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">
                  {metrics?.lastTradeAt ? (
                    <span title={new Date(metrics.lastTradeAt * 1000).toISOString()}>
                      {formatAge(metrics.lastTradeAt)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import type { ReactNode } from "react";

import type {
  LeaderboardActivity,
  LeaderboardClosedPosition,
  LeaderboardPosition,
} from "@/server/leaderboard/types";
import {
  formatEpochUtc,
  formatSignedUsd,
  formatUsd,
  pnlTextClass,
} from "@/lib/leaderboard-format";

function price(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value >= 1 ? value.toFixed(2) : value.toFixed(3);
}

function MarketCell({
  row,
}: {
  row: {
    title: string | null;
    outcome: string | null;
    eventSlug: string | null;
    slug: string | null;
  };
}) {
  const eventSlug = row.eventSlug ?? row.slug;
  return (
    <div className="max-w-[320px]">
      {eventSlug ? (
        <a
          href={`https://polymarket.com/event/${eventSlug}`}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-2 text-gray-700 hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-400"
        >
          {row.title ?? "Unknown market"}
        </a>
      ) : (
        <span className="line-clamp-2 text-gray-700 dark:text-gray-300">
          {row.title ?? "Unknown market"}
        </span>
      )}
      {row.outcome && (
        <span className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600 dark:bg-white/10 dark:text-gray-300">
          {row.outcome}
        </span>
      )}
    </div>
  );
}

function TableShell({
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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
          {title}
        </h3>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const TH =
  "py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400 first:pl-1";
const TD = "py-3 pr-4 text-sm text-gray-700 dark:text-gray-300";

export default function TraderTables({
  positions,
  closedPositions,
  activity,
}: {
  positions: LeaderboardPosition[];
  closedPositions: LeaderboardClosedPosition[];
  activity: LeaderboardActivity[];
}) {
  const shownPositions = positions.slice(0, 20);
  const shownClosed = closedPositions.slice(0, 20);
  const shownActivity = activity.slice(0, 40);

  return (
    <div className="space-y-6">
      <TableShell
        title="Open positions"
        hint={
          positions.length > shownPositions.length
            ? `Showing ${shownPositions.length} of ${positions.length}`
            : `${positions.length} position${positions.length === 1 ? "" : "s"}`
        }
      >
        {shownPositions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No open positions.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full">
              <thead>
                <tr>
                  <th className={TH}>Market</th>
                  <th className={`${TH} text-right`}>Size</th>
                  <th className={`${TH} text-right`}>Avg</th>
                  <th className={`${TH} text-right`}>Now</th>
                  <th className={`${TH} text-right`}>Value</th>
                  <th className={`${TH} text-right`}>PnL</th>
                </tr>
              </thead>
              <tbody>
                {shownPositions.map((position) => (
                  <tr
                    key={position.asset}
                    className="border-t border-gray-100 dark:border-gray-800"
                  >
                    <td className={`${TD} max-w-[320px]`}>
                      <MarketCell row={position} />
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {position.size.toLocaleString("en-US", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {price(position.avgPrice)}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {price(position.curPrice)}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {formatUsd(position.currentValue)}
                    </td>
                    <td
                      className={`${TD} text-right tabular-nums ${pnlTextClass(position.cashPnl)}`}
                    >
                      {formatSignedUsd(position.cashPnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableShell>

      <TableShell
        title="Closed positions"
        hint={
          closedPositions.length > shownClosed.length
            ? `Showing ${shownClosed.length} of ${closedPositions.length}`
            : `${closedPositions.length} closed`
        }
      >
        {shownClosed.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No closed positions were returned.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full">
              <thead>
                <tr>
                  <th className={TH}>Market</th>
                  <th className={`${TH} text-right`}>Cost</th>
                  <th className={`${TH} text-right`}>Avg</th>
                  <th className={`${TH} text-right`}>Realized PnL</th>
                  <th className={`${TH} text-right`}>Closed</th>
                </tr>
              </thead>
              <tbody>
                {shownClosed.map((position) => (
                  <tr
                    key={position.asset}
                    className="border-t border-gray-100 dark:border-gray-800"
                  >
                    <td className={`${TD} max-w-[320px]`}>
                      <MarketCell row={position} />
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {formatUsd(position.totalBought * position.avgPrice)}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {price(position.avgPrice)}
                    </td>
                    <td
                      className={`${TD} text-right tabular-nums ${pnlTextClass(position.realizedPnl)}`}
                    >
                      {formatSignedUsd(position.realizedPnl)}
                    </td>
                    <td className={`${TD} text-right text-gray-500`}>
                      {formatEpochUtc(position.closedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableShell>

      <TableShell
        title="Recent trades"
        hint={
          activity.length > shownActivity.length
            ? `Showing latest ${shownActivity.length} of ${activity.length} fetched`
            : `${activity.length} fetched`
        }
      >
        {shownActivity.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No trades were returned.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full">
              <thead>
                <tr>
                  <th className={TH}>Time (UTC)</th>
                  <th className={TH}>Market</th>
                  <th className={TH}>Side</th>
                  <th className={`${TH} text-right`}>Shares</th>
                  <th className={`${TH} text-right`}>Price</th>
                  <th className={`${TH} text-right`}>Notional</th>
                  <th className={`${TH} text-right`}>Tx</th>
                </tr>
              </thead>
              <tbody>
                {shownActivity.map((trade) => (
                  <tr
                    key={trade.id}
                    className="border-t border-gray-100 dark:border-gray-800"
                  >
                    <td className={`${TD} whitespace-nowrap text-xs text-gray-500`}>
                      {formatEpochUtc(trade.timestamp)}
                    </td>
                    <td className={`${TD} max-w-[300px]`}>
                      <MarketCell row={trade} />
                    </td>
                    <td className={TD}>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          trade.side === "BUY"
                            ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                            : trade.side === "SELL"
                              ? "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400"
                              : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
                        }`}
                      >
                        {trade.side ?? trade.type ?? "—"}
                      </span>
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {trade.size.toLocaleString("en-US", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {price(trade.price)}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {formatUsd(trade.usdcSize)}
                    </td>
                    <td className={`${TD} text-right`}>
                      {trade.txHash ? (
                        <a
                          href={`https://polygonscan.com/tx/${trade.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-brand-500 hover:text-brand-600"
                        >
                          open
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableShell>
    </div>
  );
}

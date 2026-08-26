"use client";
import React from "react";
import Link from "next/link";
import Badge from "@/components/ui/badge/Badge";
import { formatNumber, formatVolume, formatTime } from "@/components/dashboard/format";
import type { DashboardSummary } from "@/types/dashboard";

const statusColor: Record<string, "success" | "warning" | "error" | "info" | "light"> = {
  active: "success",
  open: "success",
  closed: "light",
  resolved: "info",
  expired: "warning",
  pending: "warning",
};

export const AssetBreakdownTable: React.FC<{ summary: DashboardSummary }> = ({ summary }) => {
  const totalMarkets = summary.totals.markets || 1;
  const totalVolume = summary.totals.volume || 1;
  const rows = summary.byAsset;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
      <div className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Asset Breakdown
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Market counts and cumulative volume per crypto asset
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 dark:bg-zinc-800/40 text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-5 py-3 sm:px-6">Asset</th>
              <th className="px-3 py-3">5m</th>
              <th className="px-3 py-3">15m</th>
              <th className="px-3 py-3 text-right">Markets</th>
              <th className="px-3 py-3">Share</th>
              <th className="px-5 py-3 sm:px-6 text-right">Volume</th>
              <th className="px-5 py-3 sm:px-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-gray-400">
                  No market data yet.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const share = (row.markets / totalMarkets) * 100;
              const volumeShare = (row.volume / totalVolume) * 100;
              return (
                <tr
                  key={row.asset}
                  className="text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-zinc-800/30"
                >
                  <td className="px-5 py-3 sm:px-6 font-semibold">
                    {row.asset.toUpperCase()}
                  </td>
                  <td className="px-3 py-3">{formatNumber(row.markets5m)}</td>
                  <td className="px-3 py-3">{formatNumber(row.markets15m)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatNumber(row.markets)}
                  </td>
                  <td className="px-3 py-3 w-40">
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-zinc-800">
                      <div
                        className="h-2 rounded-full bg-brand-500"
                        style={{ width: `${Math.min(share, 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-gray-400">
                      {share.toFixed(1)}% · {volumeShare.toFixed(1)}% vol
                    </div>
                  </td>
                  <td className="px-5 py-3 sm:px-6 text-right tabular-nums">
                    {formatVolume(row.volume)}
                  </td>
                  <td className="px-5 py-3 sm:px-6 text-right">
                    <div className="flex items-center justify-end gap-2 text-xs">
                      <Link
                        href={`/polymarket?period=5m&asset=${row.asset}`}
                        className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        5m
                      </Link>
                      <Link
                        href={`/polymarket?period=15m&asset=${row.asset}`}
                        className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        15m
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface MarketRow {
  slug: string;
  asset: string;
  period: string;
  start_epoch: number;
  volume: number;
  status: string;
  volume_label?: string;
}

export const TopVolumeList: React.FC<{ rows: MarketRow[] }> = ({ rows }) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Top Volume Markets
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Highest-volume prediction windows across all assets
        </p>
      </div>
      <Badge color="success">All-time</Badge>
    </div>
    <ul className="mt-4 divide-y divide-gray-100 dark:divide-zinc-800">
      {rows.length === 0 && (
        <li className="py-6 text-center text-sm text-gray-400">No markets yet</li>
      )}
      {rows.map((row, idx) => (
        <li key={row.slug}>
          <Link
            href={`/polymarket?period=${row.period}&asset=${row.asset}`}
            className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/40 rounded-md px-1"
          >
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 text-xs font-semibold">
                {idx + 1}
              </span>
              <div className="flex flex-col">
                <span className="font-mono text-sm font-semibold text-gray-800 dark:text-white/90">
                  {row.slug}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {row.asset.toUpperCase()} · {row.period.toUpperCase()} · {formatTime(row.start_epoch)}
                </span>
              </div>
            </div>
            <span className="tabular-nums text-sm font-semibold text-success-600 dark:text-success-500">
              {formatVolume(row.volume)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

export const LatestWindowsList: React.FC<{ rows: MarketRow[] }> = ({ rows }) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Recently Opened Windows
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Latest prediction windows across all assets
        </p>
      </div>
      <Badge color="info">Live feed</Badge>
    </div>
    <ul className="mt-4 divide-y divide-gray-100 dark:divide-zinc-800">
      {rows.length === 0 && (
        <li className="py-6 text-center text-sm text-gray-400">No markets yet</li>
      )}
      {rows.map((row) => (
        <li key={row.slug}>
          <Link
            href={`/polymarket?period=${row.period}&asset=${row.asset}`}
            className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/40 rounded-md px-1"
          >
            <div className="flex flex-col">
              <span className="font-mono text-sm font-semibold text-gray-800 dark:text-white/90">
                {row.slug}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatTime(row.start_epoch)} · {row.asset.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Badge color={statusColor[row.status] ?? "light"}>{row.status}</Badge>
              <span className="tabular-nums text-sm text-gray-700 dark:text-gray-200">
                {formatVolume(row.volume)}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

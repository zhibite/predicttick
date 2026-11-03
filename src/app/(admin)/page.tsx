import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { CalenderIcon, GridIcon, PieChartIcon, TableIcon } from "@/icons";
import { getMeta } from "@/lib/dataset";
import {
  formatCompact,
  formatDateRange,
  formatNumber,
  formatUtcDate,
  formatUtcTime,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Overview | PolyKlines",
  description:
    "Polymarket Up/Down kline dataset coverage across every tracked coin.",
};

export default async function OverviewPage() {
  const meta = await getMeta();
  const { assets, summary } = meta;

  const computedWindows = assets.reduce(
    (total, asset) =>
      total +
      asset.series.reduce((sum, series) => sum + (series.markets ?? 0), 0),
    0,
  );
  const computedRows = assets.reduce(
    (total, asset) =>
      total +
      asset.series.reduce(
        (sum, series) => sum + (series.rows ?? 0) + (series.fineRows ?? 0),
        0,
      ),
    0,
  );

  const totalWindows = summary?.markets ?? computedWindows;
  const totalRows =
    summary != null
      ? (summary.klines_rows ?? 0) + (summary.fine_rows ?? 0)
      : computedRows;

  const firstDates = assets
    .flatMap((asset) => asset.series.map((series) => series.firstDate))
    .filter((value): value is string => Boolean(value))
    .sort();
  const lastDates = assets
    .flatMap((asset) => asset.series.map((series) => series.lastDate))
    .filter((value): value is string => Boolean(value))
    .sort();

  const coverage = formatDateRange(firstDates[0], lastDates[lastDates.length - 1]);

  return (
    <div>
      <PageBreadcrumb pageTitle="Overview" />

      {/* Hero */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-500">
          Polymarket research dataset
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90 md:text-3xl">
          Up/Down kline explorer
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
          Every 5-minute, 15-minute, 1-hour and 4-hour Up/Down window, collected
          live from the Polymarket CLOB WebSocket. Best bid/ask and last trade
          are sampled every 1s / 5s / 10s / 30s respectively, then served
          straight from the local database.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href="/markets"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            Explore markets
            <span aria-hidden="true">→</span>
          </Link>
          <span className="text-xs text-gray-400">
            {assets.length > 0
              ? `${assets.length} coins · ${coverage} (UTC)`
              : "Waiting for the first windows"}
          </span>
          <LiveBadge
            connected={meta.status?.wsConnections ?? 0}
            active={meta.status?.activeMarkets ?? 0}
          />
        </div>
      </section>

      {/* Stat tiles */}
      <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
        <Metric
          label="Coins tracked"
          value={formatNumber(assets.length)}
          hint="Each with 5m/15m/1h/4h markets"
          icon={<GridIcon className="size-6" />}
        />
        <Metric
          label="Windows"
          value={formatNumber(totalWindows)}
          hint="Captured 5m/15m/1h/4h windows"
          icon={<TableIcon className="size-6" />}
        />
        <Metric
          label="Kline samples"
          value={formatCompact(totalRows)}
          hint="UP and DOWN joined per timestamp"
          icon={<PieChartIcon className="size-6" />}
        />
        <Metric
          label="Coverage"
          value={coverage}
          hint="First to last window start (UTC)"
          icon={<CalenderIcon className="size-6" />}
        />
      </section>

      {/* Assets */}
      <section className="mt-4 md:mt-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
              Dataset by coin
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Open a series to jump straight into its latest UTC day.
            </p>
          </div>
        </div>

        {assets.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
            No windows stored yet in{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-white/10">
              {meta.dataRoot}
            </code>
            . The collector starts with the Next.js server when{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-white/10">
              POLY_COLLECTOR=1
            </code>
            ; the first 5-minute window appears within a few minutes.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 md:gap-6">
            {assets.map((asset) => (
              <div
                key={asset.asset}
                className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
                    {asset.label}
                  </h3>
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    {asset.asset}
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  {asset.series.map((series) => (
                    <Link
                      key={series.period}
                      href={`/markets?asset=${asset.asset}&period=${series.period}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 transition-colors hover:border-brand-300 hover:bg-brand-25 dark:border-gray-800 dark:hover:border-brand-800 dark:hover:bg-brand-500/5"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                          {series.period}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {formatNumber(series.markets)} windows ·{" "}
                          {formatDateRange(series.firstDate, series.lastDate)}
                        </p>
                      </div>
                      <span
                        aria-hidden="true"
                        className="text-gray-400"
                      >
                        →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Dataset details */}
      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
          Dataset
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">
              SQLite database
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-300">
              {meta.dataRoot}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">
              Collector heartbeat
            </dt>
            <dd className="mt-1 text-gray-700 dark:text-gray-300">
              {meta.status?.heartbeatAt
                ? `${formatUtcDate(
                    new Date(meta.status.heartbeatAt * 1000).toISOString(),
                  )} ${formatUtcTime(
                    new Date(meta.status.heartbeatAt * 1000).toISOString(),
                  )} UTC`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">
              Active markets
            </dt>
            <dd className="mt-1 text-gray-700 dark:text-gray-300">
              {formatNumber(meta.status?.activeMarkets ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">
              WebSocket connections
            </dt>
            <dd className="mt-1 text-gray-700 dark:text-gray-300">
              {formatNumber(meta.status?.wsConnections ?? 0)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function LiveBadge({
  connected,
  active,
}: {
  connected: number;
  active: number;
}) {
  const live = connected > 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
        live
          ? "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
          : "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-white/5 dark:text-gray-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          live ? "bg-success-500" : "bg-gray-400"
        }`}
      />
      {live ? `Live · ${active} markets` : "Collector offline"}
    </span>
  );
}

function Metric({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-white/90">
        {icon}
      </div>
      <p className="mt-5 text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-400">{hint}</p>
    </div>
  );
}

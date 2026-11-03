"use client";

import { useEffect, useMemo, useState } from "react";

import Badge from "@/components/ui/badge/Badge";
import {
  assetLabel,
  formatClock,
  formatNumber,
  formatPercent,
  formatUtcDate,
  formatUtcTime,
} from "@/lib/format";
import { buildSeries, summarize } from "@/lib/series";
import { PERIODS, PERIOD_SECONDS } from "@/lib/types";
import type {
  MetaResponse,
  Period,
  WindowResponse,
  WindowSummary,
  WindowsResponse,
} from "@/lib/types";

import WindowChart from "./WindowChart";

interface MarketExplorerProps {
  initialAsset?: string;
  initialPeriod?: Period;
  initialDate?: string;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep the status message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export default function MarketExplorer({
  initialAsset,
  initialPeriod,
  initialDate,
}: MarketExplorerProps) {
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [asset, setAsset] = useState(initialAsset ?? "");
  const [period, setPeriod] = useState<Period>(initialPeriod ?? "5m");
  const [date, setDate] = useState(initialDate ?? "");

  const [windows, setWindows] = useState<WindowSummary[]>([]);
  const [windowsLoading, setWindowsLoading] = useState(false);
  const [windowsError, setWindowsError] = useState<string | null>(null);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [windowData, setWindowData] = useState<WindowResponse | null>(null);
  const [windowLoading, setWindowLoading] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);

  const [showFine, setShowFine] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchJson<MetaResponse>("/api/meta", controller.signal)
      .then((data) => {
        setMeta(data);
        setMetaError(null);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setMetaError(error.message);
      });
    return () => controller.abort();
  }, []);

  const assetInfo = useMemo(() => {
    if (!meta || meta.assets.length === 0) return undefined;
    return meta.assets.find((item) => item.asset === asset) ?? meta.assets[0];
  }, [meta, asset]);

  const seriesInfo = useMemo(() => {
    if (!assetInfo) return undefined;
    return (
      assetInfo.series.find((item) => item.period === period) ??
      assetInfo.series[0]
    );
  }, [assetInfo, period]);

  const currentAsset = assetInfo?.asset ?? "";
  const currentPeriod: Period = seriesInfo?.period ?? "5m";
  const dates = seriesInfo?.dates ?? [];
  const currentDate = dates.includes(date)
    ? date
    : dates[dates.length - 1] ?? "";

  useEffect(() => {
    if (!currentAsset || !currentDate) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the view while a new day loads
    setWindowsLoading(true);
    setWindowsError(null);
    setWindows([]);
    setSelectedSlug(null);
    setWindowData(null);

    fetchJson<WindowsResponse>(
      `/api/windows?asset=${encodeURIComponent(currentAsset)}&period=${currentPeriod}&date=${encodeURIComponent(currentDate)}`,
      controller.signal,
    )
      .then((data) => {
        setWindows(data.windows);
        // Prefer the window that is trading right now; otherwise the most
        // recent window that already has samples.
        const nowSeconds = Date.now() / 1000;
        const step = PERIOD_SECONDS[data.period];
        const active = data.windows.find(
          (item) =>
            item.startEpoch <= nowSeconds &&
            nowSeconds < item.startEpoch + step,
        );
        const withSamples = data.windows.find(
          (item) => item.numUpPoints > 0,
        );
        setSelectedSlug(
          active?.slug ?? withSamples?.slug ?? data.windows[0]?.slug ?? null,
        );
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setWindowsError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setWindowsLoading(false);
      });

    return () => controller.abort();
  }, [currentAsset, currentPeriod, currentDate]);

  useEffect(() => {
    if (!selectedSlug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the chart when nothing is selected
      setWindowData(null);
      setWindowError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let first = true;

    const load = async () => {
      if (first) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of a newly selected window
        setWindowLoading(true);
      }
      try {
        const data = await fetchJson<WindowResponse>(
          `/api/klines?slug=${encodeURIComponent(selectedSlug)}`,
          controller.signal,
        );
        if (cancelled) return;
        setWindowData(data);
        setWindowError(null);
        // Keep refreshing while the market is live and for a few minutes
        // after the close so the late resolution can arrive.
        if (data.endEpoch * 1000 + 180_000 > Date.now()) {
          timer = setTimeout(() => void load(), 2_000);
        }
      } catch (error) {
        if (!cancelled && (error as Error).name !== "AbortError") {
          setWindowError((error as Error).message);
        }
      } finally {
        if (!cancelled && first) {
          first = false;
          setWindowLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [selectedSlug]);

  const chart = useMemo(
    () => (windowData ? buildSeries(windowData, showFine) : null),
    [windowData, showFine],
  );
  const stats = useMemo(() => (chart ? summarize(chart) : null), [chart]);

  const periodsAvailable = new Set(
    assetInfo?.series.map((item) => item.period) ?? [],
  );
  const fineAvailable =
    windowData?.period === "15m" && (windowData.fine?.length ?? 0) > 0;

  if (metaError) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
        Could not read the dataset: {metaError}
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <span className="text-sm text-gray-500">Loading dataset…</span>
      </div>
    );
  }

  if (meta.assets.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
          Waiting for data
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          No windows stored yet in{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-white/10">
            {meta.dataRoot}
          </code>
          . The live collector starts with the Next.js server when{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-white/10">
            POLY_COLLECTOR=1
          </code>
          ; the first market appears within a few minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Filters: one row above the content they scope */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-white/[0.03] md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-gray-400">
            Asset
          </span>
          {meta.assets.map((item) => {
            const active = item.asset === currentAsset;
            return (
              <button
                key={item.asset}
                type="button"
                onClick={() => setAsset(item.asset)}
                aria-pressed={active}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-500 text-white"
                    : "border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
                title={item.label}
              >
                {item.asset.toUpperCase()}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            {PERIODS.map((value) => {
              const active = value === currentPeriod;
              const enabled = periodsAvailable.has(value);
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!enabled}
                  onClick={() => setPeriod(value)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? "bg-brand-500 text-white"
                      : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                  }`}
                >
                  {value}
                </button>
              );
            })}
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            Date (UTC)
            <select
              value={currentDate}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
            >
              {[...dates].reverse().map((value) => (
                <option key={value} value={value}>
                  {formatUtcDate(`${value}T00:00:00Z`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        {/* Window list */}
        <section className="col-span-12 xl:col-span-4">
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
                  Windows
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {currentDate
                    ? `${formatUtcDate(`${currentDate}T00:00:00Z`)} · ${windows.length} windows`
                    : "No date selected"}
                </p>
              </div>
              {windowsLoading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
              )}
            </div>

            {windowsError ? (
              <p className="px-5 py-6 text-sm text-error-600 dark:text-error-400">
                {windowsError}
              </p>
            ) : windows.length === 0 && !windowsLoading ? (
              <p className="px-5 py-6 text-sm text-gray-500 dark:text-gray-400">
                No windows in this partition.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto xl:max-h-[560px]">
                {windows.map((item) => {
                  const active = item.slug === selectedSlug;
                  return (
                    <button
                      key={item.slug}
                      type="button"
                      onClick={() => setSelectedSlug(item.slug)}
                      aria-pressed={active}
                      className={`w-full border-b border-gray-100 px-5 py-3 text-left transition-colors last:border-b-0 dark:border-gray-800 ${
                        active
                          ? "bg-brand-50 dark:bg-brand-500/10"
                          : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium tabular-nums text-gray-800 dark:text-white/90">
                          {formatUtcTime(item.startUtc)} –{" "}
                          {formatUtcTime(item.endUtc)}{" "}
                          <span className="text-xs font-normal text-gray-400">
                            UTC
                          </span>
                        </span>
                        <Badge
                          size="sm"
                          color={
                            item.resolved === "UP"
                              ? "primary"
                              : item.resolved === "DOWN"
                                ? "warning"
                                : "light"
                          }
                        >
                          {item.resolved === "UNKNOWN"
                            ? "UNRESOLVED"
                            : item.resolved}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                        {item.title || item.slug}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-400">
                        {item.numUpPoints} UP pts · {item.numDownPoints} DOWN
                        pts
                        {item.hasFine ? " · 1s tail" : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Chart */}
        <section className="col-span-12 xl:col-span-8">
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div className="min-w-0">
                <h2 className="truncate text-base font-medium text-gray-800 dark:text-white/90">
                  {windowData?.title || "Select a window"}
                </h2>
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                  {windowData
                    ? `${assetLabel(windowData.asset)} · ${windowData.period} · ${windowData.slug}`
                    : "Choose a window from the list to plot its UP/DOWN prices."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {windowData && (
                  <Badge
                    color={
                      windowData.resolved === "UP"
                        ? "primary"
                        : windowData.resolved === "DOWN"
                          ? "warning"
                          : "light"
                    }
                  >
                    {windowData.resolved === "UNKNOWN"
                      ? "UNRESOLVED"
                      : `RESOLVED ${windowData.resolved}`}
                  </Badge>
                )}
                {fineAvailable && (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={showFine}
                      onChange={(event) => setShowFine(event.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-600"
                    />
                    1s tail
                  </label>
                )}
              </div>
            </div>

            <div className="p-4 sm:p-5">
              {windowError && (
                <p className="mb-4 text-sm text-error-600 dark:text-error-400">
                  {windowError}
                </p>
              )}

              {stats && chart && windowData ? (
                <div
                  className={`transition-opacity ${windowLoading ? "opacity-60" : ""}`}
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="UP open" value={formatPercent(stats.open)} />
                    <Stat label="UP close" value={formatPercent(stats.close)} />
                    <Stat
                      label="UP range"
                      value={`${formatPercent(stats.low)} – ${formatPercent(stats.high)}`}
                    />
                    <Stat
                      label="Samples"
                      value={formatNumber(stats.samples)}
                      hint={
                        currentPeriod === "5m"
                          ? "Sampled every second"
                          : currentPeriod === "15m"
                            ? "Sampled every 5 s"
                            : currentPeriod === "1h"
                              ? "Sampled every 10 s"
                              : "Sampled every 30 s"
                      }
                    />
                  </div>

                  <div className="mt-4">
                    <WindowChart
                      series={chart}
                      startMs={windowData.startEpoch * 1000}
                      endMs={windowData.endEpoch * 1000}
                    />
                  </div>

                  {chart.rows.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-400">
                      <span className="tabular-nums">
                        Window{" "}
                        {formatClock(windowData.startEpoch * 1000)} –{" "}
                        {formatClock(windowData.endEpoch * 1000)} UTC
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        Samples {formatClock(chart.rows[0].t)} –{" "}
                        {formatClock(chart.rows[chart.rows.length - 1].t)} UTC
                      </span>
                      <span className="basis-full" />
                      <span>
                        Sampling: 5m every 1 s, 15m every 5 s, 1h every 10 s,
                        4h every 30 s. The chart is pinned to the market
                        window.
                      </span>
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] text-gray-400">
                      No samples inside this market window.
                    </p>
                  )}

                  <details className="mt-4">
                    <summary className="cursor-pointer select-none text-sm font-medium text-gray-700 dark:text-gray-300">
                      Data table{" "}
                      <span className="text-xs font-normal text-gray-400">
                        ({chart.rows.length} rows)
                      </span>
                    </summary>
                    <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-gray-200 dark:border-gray-800">
                      <table className="w-full text-left text-xs tabular-nums">
                        <thead className="sticky top-0 bg-gray-50 text-gray-500 dark:bg-zinc-800 dark:text-gray-400">
                          <tr>
                            <th className="px-3 py-2 font-medium">
                              Time (UTC)
                            </th>
                            <th className="px-3 py-2 font-medium">UP</th>
                            <th className="px-3 py-2 font-medium">DOWN</th>
                            <th className="px-3 py-2 font-medium">UP vol</th>
                            <th className="px-3 py-2 font-medium">DOWN vol</th>
                            <th className="px-3 py-2 font-medium">Step</th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-700 dark:text-gray-300">
                          {chart.rows.map((row) => (
                            <tr
                              key={`${row.t}-${row.resolution}`}
                              className="border-t border-gray-100 dark:border-gray-800"
                            >
                              <td className="px-3 py-1.5">
                                {formatClock(row.t)}
                              </td>
                              <td className="px-3 py-1.5">
                                {formatPercent(row.up)}
                              </td>
                              <td className="px-3 py-1.5">
                                {formatPercent(row.down)}
                              </td>
                              <td className="px-3 py-1.5">
                                {formatNumber(row.upVolume)}
                              </td>
                              <td className="px-3 py-1.5">
                                {formatNumber(row.downVolume)}
                              </td>
                              <td className="px-3 py-1.5 text-gray-400">
                                {row.resolution}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
              ) : (
                <div className="flex h-80 items-center justify-center rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {windowsLoading || windowLoading
                      ? "Loading window…"
                      : "No window selected."}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

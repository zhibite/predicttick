"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

import { useTheme } from "@/context/ThemeContext";
import {
  formatDay,
  formatSignedUsd,
  formatUsd,
  formatUsdCompact,
} from "@/lib/leaderboard-format";
import type {
  LeaderboardDailyPoint,
  LeaderboardPnlPoint,
} from "@/server/leaderboard/types";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

const FONT =
  "Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif";

function shortDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

export default function TraderCharts({
  pnlSeries,
  daily,
}: {
  pnlSeries: LeaderboardPnlPoint[];
  daily: LeaderboardDailyPoint[];
}) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  const muted = "#898781";
  const grid = dark ? "#2c2c2a" : "#e1e0d9";
  const surface = dark ? "#1f1f23" : "#ffffff";
  const brand = dark ? "#3987e5" : "#2a78d6";
  const success = dark ? "#3ccb7f" : "#12b76a";
  const error = dark ? "#f97066" : "#f04438";

  if (pnlSeries.length === 0 && daily.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No closed positions or trades were returned for this trader yet, so
        there is nothing to chart.
      </p>
    );
  }

  const lastPnl = pnlSeries[pnlSeries.length - 1]?.cumPnl ?? 0;
  const pnlColor = lastPnl >= 0 ? success : error;

  const pnlOptions: ApexOptions = {
    chart: {
      type: "area",
      height: 260,
      background: "transparent",
      fontFamily: FONT,
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
      parentHeightOffset: 0,
    },
    theme: { mode: dark ? "dark" : "light" },
    colors: [pnlColor],
    legend: { show: false },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 2 },
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.18, opacityTo: 0, stops: [0, 100] },
    },
    markers: {
      size: 0,
      strokeColors: surface,
      strokeWidth: 2,
      hover: { size: 6 },
    },
    grid: {
      borderColor: grid,
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 8, right: 8, bottom: 0, left: 8 },
    },
    tooltip: {
      theme: dark ? "dark" : "light",
      x: { format: "dd MMM yyyy" },
      y: { formatter: (value: number) => formatUsd(Number(value)) },
    },
    xaxis: {
      type: "datetime",
      labels: {
        style: { colors: muted, fontSize: "11px" },
        datetimeUTC: true,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: {
        style: { colors: muted, fontSize: "11px" },
        formatter: (value: number) => formatUsdCompact(Number(value)),
      },
    },
  };

  const dailyOptions: ApexOptions = {
    chart: {
      type: "bar",
      height: 260,
      background: "transparent",
      fontFamily: FONT,
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
      parentHeightOffset: 0,
    },
    theme: { mode: dark ? "dark" : "light" },
    colors: [brand, lastPnl >= 0 ? success : error],
    plotOptions: {
      bar: { columnWidth: "55%", borderRadius: 4 },
    },
    dataLabels: { enabled: false },
    stroke: { width: [0, 2], curve: "smooth" },
    markers: { size: 0, hover: { size: 5 } },
    legend: {
      position: "top",
      horizontalAlign: "right",
      labels: { colors: muted },
      fontSize: "11px",
    },
    grid: {
      borderColor: grid,
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 8, right: 8, bottom: 0, left: 8 },
    },
    tooltip: {
      theme: dark ? "dark" : "light",
      shared: true,
      intersect: false,
      y: {
        formatter: (value: number, options?: { seriesIndex?: number }) =>
          options?.seriesIndex === 1
            ? formatSignedUsd(Number(value))
            : formatUsd(Number(value)),
      },
    },
    xaxis: {
      categories: daily.map((point) => shortDay(point.day)),
      labels: {
        style: { colors: muted, fontSize: "10px" },
        rotate: -45,
        hideOverlappingLabels: true,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: [
      {
        labels: {
          style: { colors: muted, fontSize: "11px" },
          formatter: (value: number) => formatUsdCompact(Number(value)),
        },
      },
      {
        opposite: true,
        labels: {
          style: { colors: muted, fontSize: "11px" },
          formatter: (value: number) => formatUsdCompact(Number(value)),
        },
      },
    ],
  };

  return (
    <div className="space-y-6">
      {pnlSeries.length > 0 && (
        <div>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
              Cumulative realized PnL
            </h3>
            <span
              className={`text-sm font-medium tabular-nums ${
                lastPnl >= 0
                  ? "text-success-600 dark:text-success-400"
                  : "text-error-600 dark:text-error-400"
              }`}
            >
              {formatSignedUsd(lastPnl)}
            </span>
          </div>
          <p className="mb-2 text-xs text-gray-400">
            Closed positions grouped by UTC day. Starting point is the oldest
            closed position returned by Polymarket.
          </p>
          <div className="rounded-xl border border-gray-100 bg-white p-2 dark:border-gray-800 dark:bg-transparent">
            <ReactApexChart
              options={pnlOptions}
              series={[
                {
                  name: "Cumulative realized PnL",
                  data: pnlSeries.map((point) => ({
                    x: point.t * 1000,
                    y: point.cumPnl,
                  })),
                },
              ]}
              type="area"
              height={260}
            />
          </div>
        </div>
      )}

      {daily.length > 0 && (
        <div>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
              Daily volume and realized PnL
            </h3>
            <span className="text-xs text-gray-400">
              {formatDay(daily[0].day)} – {formatDay(daily[daily.length - 1].day)}
            </span>
          </div>
          <p className="mb-2 text-xs text-gray-400">
            Bars use the left axis (USD notional). The line uses the right axis
            (realized PnL).
          </p>
          <div className="rounded-xl border border-gray-100 bg-white p-2 dark:border-gray-800 dark:bg-transparent">
            <ReactApexChart
              options={dailyOptions}
              series={[
                {
                  name: "Volume",
                  type: "bar",
                  data: daily.map(
                    (point) => Math.round(point.volume * 100) / 100,
                  ),
                },
                {
                  name: "Realized PnL",
                  type: "line",
                  data: daily.map(
                    (point) => Math.round(point.realizedPnl * 100) / 100,
                  ),
                },
              ]}
              type="bar"
              height={260}
            />
          </div>
        </div>
      )}
    </div>
  );
}

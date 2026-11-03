"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

import { useTheme } from "@/context/ThemeContext";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

export interface EquityPoint {
  t: number;
  pnl: number;
  cumPnl: number;
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function sampledIndexes(length: number, maxPoints = 600): Set<number> | null {
  if (length <= maxPoints) return null;
  const step = Math.ceil(length / maxPoints);
  const indexes = new Set<number>();
  for (let index = 0; index < length; index += step) indexes.add(index);
  indexes.add(length - 1);
  return indexes;
}

function buildDrawdown(points: EquityPoint[]) {
  let peak = Number.NEGATIVE_INFINITY;
  return points.map((point) => {
    peak = Math.max(peak, point.cumPnl);
    return { x: point.t * 1000, y: point.cumPnl - peak };
  });
}

function chartOptions(input: {
  dark: boolean;
  color: string;
  surface: string;
  muted: string;
  grid: string;
  min: number;
  max: number;
  showXLabels: boolean;
}): ApexOptions {
  const { dark, color, surface, muted, grid, min, max, showXLabels } = input;

  return {
    chart: {
      type: "area",
      height: showXLabels ? 150 : 200,
      background: "transparent",
      fontFamily:
        "Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
      parentHeightOffset: 0,
    },
    theme: { mode: dark ? "dark" : "light" },
    colors: [color],
    legend: { show: false },
    dataLabels: { enabled: false },
    stroke: {
      curve: "straight",
      width: 2,
      lineCap: "round",
    },
    fill: {
      type: "gradient",
      gradient: {
        opacityFrom: 0.12,
        opacityTo: 0,
        stops: [0, 100],
      },
    },
    markers: {
      size: 0,
      strokeColors: surface,
      strokeWidth: 2,
      hover: { size: 8 },
    },
    grid: {
      borderColor: grid,
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 8, right: 8, bottom: 0, left: 8 },
    },
    tooltip: {
      shared: true,
      intersect: false,
      theme: dark ? "dark" : "light",
      x: { format: "dd MMM yyyy HH:mm" },
      y: {
        formatter: (value: number) => formatUsd(Number(value)),
      },
    },
    xaxis: {
      type: "datetime",
      min,
      max,
      labels: {
        show: showXLabels,
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
        formatter: (value: number) => formatUsd(Number(value)),
      },
    },
  };
}

export default function EquityCurveChart({
  points,
}: {
  points: EquityPoint[];
}) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  if (points.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No trades in this run, so there is no equity curve.
      </p>
    );
  }

  const indexes = sampledIndexes(points.length);
  const sampled = indexes
    ? points.filter((_, index) => indexes.has(index))
    : points;
  const drawdownFull = buildDrawdown(points);

  const rawTimes = points.map((point) => point.t * 1000);
  let min = Math.min(...rawTimes);
  let max = Math.max(...rawTimes);
  if (min === max) {
    min -= 60_000;
    max += 60_000;
  }

  const equityData = sampled.map((point) => ({
    x: point.t * 1000,
    y: point.cumPnl,
  }));
  const drawdownData = indexes
    ? drawdownFull.filter((_, index) => indexes.has(index))
    : drawdownFull;

  const equityColor = dark ? "#3987e5" : "#2a78d6";
  const drawdownColor = dark ? "#e66767" : "#e34948";
  const surface = dark ? "#1f1f23" : "#ffffff";
  const muted = "#898781";
  const grid = dark ? "#2c2c2a" : "#e1e0d9";
  const last = sampled[sampled.length - 1];
  const maxDrawdown = Math.abs(
    Math.min(...drawdownFull.map((row) => row.y)),
  );

  const equityOptions = chartOptions({
    dark,
    color: equityColor,
    surface,
    muted,
    grid,
    min,
    max,
    showXLabels: false,
  });
  const drawdownOptions = chartOptions({
    dark,
    color: drawdownColor,
    surface,
    muted,
    grid,
    min,
    max,
    showXLabels: true,
  });

  return (
    <div className="space-y-4" aria-label="Equity curve and drawdown charts">
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
            Cumulative PnL
          </h3>
          <span
            className={`text-sm font-medium tabular-nums ${
              last.cumPnl >= 0
                ? "text-success-600 dark:text-success-400"
                : "text-error-600 dark:text-error-400"
            }`}
          >
            {last.cumPnl >= 0 ? "+" : ""}
            {formatUsd(last.cumPnl)}
          </span>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-2 dark:border-gray-800 dark:bg-transparent">
          <ReactApexChart
            options={equityOptions}
            series={[{ name: "Cumulative PnL", data: equityData }]}
            type="area"
            height={200}
          />
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
            Drawdown
          </h3>
          <span className="text-sm font-medium tabular-nums text-error-600 dark:text-error-400">
            −{formatUsd(maxDrawdown)}
          </span>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-2 dark:border-gray-800 dark:bg-transparent">
          <ReactApexChart
            options={drawdownOptions}
            series={[{ name: "Drawdown", data: drawdownData }]}
            type="area"
            height={150}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

import { useTheme } from "@/context/ThemeContext";
import { formatUsd, formatUsdCompact } from "@/lib/leaderboard-format";
import type { PaperEquityRow } from "@/server/paper/types";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

const FONT =
  "Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif";

export default function PaperEquityChart({
  points,
}: {
  points: PaperEquityRow[];
}) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  if (points.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No equity points yet. Start the strategy and the engine will record one
        point per minute.
      </p>
    );
  }

  const muted = "#898781";
  const grid = dark ? "#2c2c2a" : "#e1e0d9";
  const brand = dark ? "#3987e5" : "#2a78d6";
  const success = dark ? "#3ccb7f" : "#12b76a";
  const error = dark ? "#f97066" : "#f04438";
  const last = points[points.length - 1];

  const options: ApexOptions = {
    chart: {
      type: "area",
      height: 280,
      background: "transparent",
      fontFamily: FONT,
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
      parentHeightOffset: 0,
    },
    theme: { mode: dark ? "dark" : "light" },
    colors: [brand, success, error],
    legend: {
      position: "top",
      horizontalAlign: "right",
      labels: { colors: muted },
      fontSize: "11px",
    },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: [2, 1.5, 1.5] },
    fill: {
      type: ["gradient", "solid", "solid"],
      gradient: { opacityFrom: 0.16, opacityTo: 0, stops: [0, 100] },
      opacity: [0.2, 0, 0],
    },
    markers: { size: 0, hover: { size: 5 } },
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
      x: { format: "dd MMM HH:mm" },
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

  const series = [
    {
      name: "Equity",
      data: points.map((point) => ({ x: point.ts * 1000, y: point.equity })),
    },
    {
      name: "Realized PnL",
      data: points.map((point) => ({
        x: point.ts * 1000,
        y: point.realized_pnl,
      })),
    },
    {
      name: "Unrealized PnL",
      data: points.map((point) => ({
        x: point.ts * 1000,
        y: point.unrealized_pnl,
      })),
    },
  ];

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
          Paper equity
        </h3>
        <span className="text-sm font-medium tabular-nums text-gray-700 dark:text-gray-300">
          {formatUsd(last.equity)}
        </span>
      </div>
      <div className="rounded-xl border border-gray-100 bg-white p-2 dark:border-gray-800 dark:bg-transparent">
        <ReactApexChart
          options={options}
          series={series}
          type="area"
          height={280}
        />
      </div>
    </div>
  );
}

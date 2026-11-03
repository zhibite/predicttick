"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ApexOptions } from "apexcharts";

import { useTheme } from "@/context/ThemeContext";
import { formatPercent } from "@/lib/format";
import type { ChartSeries } from "@/lib/series";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface WindowChartProps {
  series: ChartSeries;
  /** Market window bounds; the x-axis is pinned to exactly this range. */
  startMs: number;
  endMs: number;
  height?: number;
}

export default function WindowChart({
  series,
  startMs,
  endMs,
  height = 420,
}: WindowChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // A 5-minute window at HH:mm would repeat the same minute across ticks.
  const shortWindow = endMs - startMs <= 6 * 60_000;

  const options = useMemo<ApexOptions>(() => {
    const grid = isDark ? "#2c2c2a" : "#e1e0d9";
    const axis = "#898781";
    const legendInk = isDark ? "#c3c2b7" : "#52514e";

    return {
      chart: {
        type: "line",
        height,
        fontFamily: "Outfit, sans-serif",
        background: "transparent",
        toolbar: { show: false },
        animations: { enabled: false },
        zoom: { enabled: false },
      },
      colors: isDark ? ["#3987e5", "#d95926"] : ["#2a78d6", "#eb6834"],
      stroke: { curve: "straight", width: 2 },
      markers: {
        size: 0,
        strokeWidth: 0,
        hover: { size: 5, sizeOffset: 0 },
      },
      dataLabels: { enabled: false },
      legend: {
        show: true,
        position: "top",
        horizontalAlign: "left",
        fontSize: "12px",
        labels: { colors: legendInk },
        itemMargin: { horizontal: 12, vertical: 0 },
        markers: { size: 4, offsetX: 0 },
      },
      grid: {
        borderColor: grid,
        strokeDashArray: 0,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
        padding: { left: 8, right: 12 },
      },
      xaxis: {
        type: "datetime",
        min: startMs,
        max: endMs,
        tickAmount: shortWindow ? 5 : 6,
        labels: {
          datetimeUTC: true,
          format: shortWindow ? "HH:mm:ss" : "HH:mm",
          style: { colors: axis, fontSize: "11px" },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
        crosshairs: {
          show: true,
          width: 1,
          position: "back",
          stroke: { color: grid, width: 1, dashArray: 0 },
        },
      },
      yaxis: {
        min: 0,
        max: 1,
        tickAmount: 4,
        labels: {
          formatter: (value: number) => formatPercent(value, 0),
          style: { colors: axis, fontSize: "11px" },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      tooltip: {
        shared: true,
        intersect: false,
        theme: isDark ? "dark" : "light",
        x: { format: "HH:mm:ss" },
        y: {
          formatter: (value: number | null | undefined) =>
            value == null ? "—" : formatPercent(value),
        },
      },
      annotations: {
        yaxis: [
          {
            y: 0.5,
            borderColor: isDark ? "#3f3f46" : "#e4e4e7",
            strokeDashArray: 0,
          },
        ],
      },
      noData: {
        text: "No samples for this window",
        align: "center",
        verticalAlign: "middle",
        style: { color: axis, fontSize: "13px" },
      },
    };
  }, [height, isDark, shortWindow, startMs, endMs]);

  const apexSeries = useMemo(
    () => [
      { name: "UP", data: series.up },
      { name: "DOWN", data: series.down },
    ],
    [series],
  );

  return (
    <Chart
      options={options}
      series={apexSeries}
      type="line"
      height={height}
      width="100%"
    />
  );
}

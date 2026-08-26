"use client";
import React from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { formatNumber, formatVolume } from "@/components/dashboard/format";
import type { DashboardSummary } from "@/types/dashboard";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

interface Props {
  summary: DashboardSummary;
}

export const AssetDistributionChart: React.FC<Props> = ({ summary }) => {
  const labels = summary.byAsset.map((row) => row.asset.toUpperCase());
  const markets = summary.byAsset.map((row) => row.markets);

  const total = markets.reduce((a, b) => a + b, 0);
  const options: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "donut",
      height: 280,
    },
    labels,
    legend: {
      position: "bottom",
      fontFamily: "Outfit",
      fontSize: "13px",
    },
    plotOptions: {
      pie: {
        donut: {
          size: "70%",
          labels: {
            show: true,
            name: {
              fontSize: "14px",
              fontWeight: 500,
            },
            value: {
              fontSize: "22px",
              fontWeight: 600,
              color: "#1D2939",
              formatter: (val: string) => `${val}`,
            },
            total: {
              show: true,
              label: "Total windows",
              fontSize: "13px",
              color: "#6b7280",
              formatter: () => formatNumber(total),
            },
          },
        },
      },
    },
    colors: ["#465FFF", "#12B76A", "#F79009", "#F04438", "#9E77ED", "#22D3EE", "#EC4899"],
    dataLabels: { enabled: false },
    stroke: { width: 2, colors: ["#fff"] },
    tooltip: {
      y: {
        formatter: (val: number) => `${formatNumber(val)} markets`,
      },
    },
  };

  const series = markets;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
        Markets by Asset
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Distribution of tracked windows across crypto assets
      </p>
      <div className="mt-4">
        <ReactApexChart
          options={options}
          series={series}
          type="donut"
          height={280}
        />
      </div>
    </div>
  );
};

export const PeriodDistributionChart: React.FC<Props> = ({ summary }) => {
  const fiveMin =
    summary.byPeriod.find((p) => p.period === "5m") ?? { period: "5m" as const, markets: 0, volume: 0 };
  const fifteenMin =
    summary.byPeriod.find((p) => p.period === "15m") ?? { period: "15m" as const, markets: 0, volume: 0 };

  const options: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      height: 280,
      toolbar: { show: false },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "55%",
        borderRadius: 6,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: {
      enabled: true,
      style: { fontFamily: "Outfit", fontSize: "12px", fontWeight: 600 },
      formatter: (val: number) => formatNumber(val),
    },
    colors: ["#465FFF", "#12B76A"],
    stroke: { show: true, width: 2, colors: ["transparent"] },
    grid: { borderColor: "#E4E7EC", yaxis: { lines: { show: true } } },
    xaxis: {
      categories: ["5-Minute", "15-Minute"],
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      title: { text: "Markets", style: { fontFamily: "Outfit", fontSize: "12px", color: "#6b7280" } },
      labels: {
        formatter: (val: number) => formatNumber(val),
      },
    },
    legend: { show: false },
    fill: { opacity: 1 },
    tooltip: {
      y: {
        formatter: (val: number, { dataPointIndex }) => {
          const period = dataPointIndex === 0 ? "5m" : "15m";
          const volume = dataPointIndex === 0 ? fiveMin.volume : fifteenMin.volume;
          return `${formatNumber(val)} markets · ${formatVolume(volume)} volume`;
        },
      },
    },
  };

  const series = [
    {
      name: "Markets",
      data: [fiveMin.markets, fifteenMin.markets],
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
        Markets by Timeframe
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        5-minute vs 15-minute window counts
      </p>
      <div className="mt-4 max-w-full overflow-x-auto custom-scrollbar">
        <ReactApexChart
          options={options}
          series={series}
          type="bar"
          height={280}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">5-Minute Volume</p>
          <p className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90">
            {formatVolume(fiveMin.volume)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">15-Minute Volume</p>
          <p className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90">
            {formatVolume(fifteenMin.volume)}
          </p>
        </div>
      </div>
    </div>
  );
};

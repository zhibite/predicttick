"use client";
import React from "react";
import Badge from "@/components/ui/badge/Badge";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  BoltIcon,
  PieChartIcon,
  DollarLineIcon,
  TimeIcon,
} from "@/icons";
import { formatNumber, formatVolume, formatTime, formatRange } from "@/components/dashboard/format";
import type { DashboardSummary } from "@/types/dashboard";

interface KpiData {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone: "success" | "error" | "brand" | "neutral";
  badge?: { label: string; direction: "up" | "down"; value: string };
}

export const DashboardKpis: React.FC<{ summary: DashboardSummary }> = ({ summary }) => {
  const { totals, timeRange, byPeriod } = summary;
  const fiveMinCount = byPeriod.find((p) => p.period === "5m")?.markets ?? 0;
  const fifteenMinCount = byPeriod.find((p) => p.period === "15m")?.markets ?? 0;
  const fivePct = totals.markets
    ? Math.round((fiveMinCount / totals.markets) * 100)
    : 0;

  const lastWindow = summary.latest[0];
  const lastWindowLabel = lastWindow
    ? formatTime(lastWindow.start_epoch)
    : "—";

  const cards: KpiData[] = [
    {
      title: "Total Markets Tracked",
      value: formatNumber(totals.markets),
      hint: `${totals.assets} crypto assets · ${totals.periods} timeframes`,
      icon: <BoltIcon className="text-brand-500 size-6" />,
      tone: "brand",
    },
    {
      title: "Active Assets",
      value: `${totals.assets}`,
      hint: timeRange
        ? `Since ${formatRange(timeRange.earliest)}`
        : "Awaiting data",
      icon: <PieChartIcon className="text-warning-500 size-6" />,
      tone: "neutral",
      badge:
        totals.markets > 0
          ? {
              label: `${totals.markets} windows`,
              direction: "up",
              value: "",
            }
          : undefined,
    },
    {
      title: "Cumulative Volume",
      value: formatVolume(totals.volume),
      hint: "Across all markets",
      icon: <DollarLineIcon className="text-success-500 size-6" />,
      tone: "success",
    },
    {
      title: "Latest Window",
      value: lastWindow ? lastWindow.slug.split("-").slice(-2).join(" ").toUpperCase() : "—",
      hint: lastWindowLabel,
      icon: <TimeIcon className="text-error-500 size-6" />,
      tone: "error",
      badge:
        fiveMinCount + fifteenMinCount > 0
          ? {
              label: `5m ${fivePct}%`,
              direction: fivePct >= 50 ? "up" : "down",
              value: "",
            }
          : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
      {cards.map((c) => (
        <div
          key={c.title}
          className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6"
        >
          <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl dark:bg-zinc-800">
            {c.icon}
          </div>
          <div className="flex items-end justify-between mt-5">
            <div>
              <span className="text-sm text-gray-500 dark:text-gray-400">{c.title}</span>
              <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
                {c.value}
              </h4>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{c.hint}</p>
            </div>
            {c.badge && (
              <Badge color={c.badge.direction === "up" ? "success" : "error"}>
                {c.badge.direction === "up" ? <ArrowUpIcon /> : <ArrowDownIcon className="text-error-500" />}
                {c.badge.label}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default DashboardKpis;

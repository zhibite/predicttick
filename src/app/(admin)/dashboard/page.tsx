"use client";

import { useEffect, useState } from "react";
import DashboardKpis from "@/components/dashboard/DashboardKpis";
import { AssetDistributionChart, PeriodDistributionChart } from "@/components/dashboard/DistributionCharts";
import { AssetBreakdownTable, TopVolumeList, LatestWindowsList } from "@/components/dashboard/DashboardLists";
import type { DashboardSummary } from "@/types/dashboard";

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/polymarkets/stats", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setSummary(json.summary ?? null);
        if (json.error) setError(json.message ?? json.error);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">
          Polymarket Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Aggregated overview of all tracked prediction markets
        </p>
      </div>

      {/* Error / empty state */}
      {error && !summary && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-500/20 dark:bg-red-500/5">
          <div className="text-4xl mb-2">⚠️</div>
          <div className="text-sm font-medium text-red-500">{error}</div>
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Verify the data source is accessible and try again.
          </div>
        </div>
      )}

      {loading && !summary && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          <span className="ml-3 text-gray-500">Loading dashboard…</span>
        </div>
      )}

      {summary && (
        <>
          {/* KPI cards row */}
          <DashboardKpis summary={summary} />

          {/* Charts row */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AssetDistributionChart summary={summary} />
            <PeriodDistributionChart summary={summary} />
          </div>

          {/* Asset breakdown table */}
          <AssetBreakdownTable summary={summary} />

          {/* Bottom: top volume + latest */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TopVolumeList rows={summary.top.slice(0, 10)} />
            <LatestWindowsList rows={summary.latest.slice(0, 10)} />
          </div>
        </>
      )}
    </div>
  );
}

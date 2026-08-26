"use client";

import { useEffect, useState } from "react";
import { ASSETS } from "@/lib/db/constants";
import Link from "next/link";

interface AssetStat {
  asset: string;
  total: number;
  periods: Partial<Record<"5m" | "15m", number>>;
}

export default function SidebarWidget() {
  const [stats, setStats] = useState<AssetStat[] | null>(null);
  const [dataDir, setDataDir] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [assetsRes, healthRes] = await Promise.all([
          fetch("/api/polymarkets/assets", { cache: "no-store" }),
          fetch("/api/polymarkets/health", { cache: "no-store" }),
        ]);
        const assetsJson = assetsRes.ok ? await assetsRes.json() : { assets: [] };
        const healthJson = healthRes.ok ? await healthRes.json() : null;
        if (cancelled) return;
        setStats(assetsJson.assets ?? []);
        if (healthJson) setDataDir(healthJson.dataDir ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalMarkets =
    stats?.reduce((sum, s) => sum + s.total, 0) ?? 0;
  const activeAssets =
    stats?.filter((s) => s.total > 0).length ?? 0;
  const coverage = ASSETS.length
    ? Math.round((activeAssets / ASSETS.length) * 100)
    : 0;

  return (
    <div className="mx-auto mb-10 w-full max-w-60 rounded-2xl border border-gray-200 bg-white px-4 py-5 text-center dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">
        PredictTick Coverage
      </h3>
      <p className="mb-4 text-gray-500 text-theme-sm dark:text-gray-400">
        Tracking Polymarket UP/DOWN prediction windows
      </p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl bg-gray-50 px-2 py-3 dark:bg-zinc-800/40">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Markets
          </p>
          <p className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90 tabular-nums">
            {totalMarkets.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 px-2 py-3 dark:bg-zinc-800/40">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Coverage
          </p>
          <p className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90 tabular-nums">
            {coverage}%
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5 mb-4">
        {(stats ?? []).map((s) => {
          const active = s.total > 0;
          return (
            <Link
              key={s.asset}
              href={`/polymarket?period=5m&asset=${s.asset}`}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-brand-500/10 text-brand-600 hover:bg-brand-500/20 dark:text-brand-400"
                  : "bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-gray-500"
              }`}
              title={`${s.asset.toUpperCase()}: ${s.total} windows`}
            >
              {s.asset.toUpperCase()}
            </Link>
          );
        })}
      </div>

      <a
        href="/dashboard"
        className="flex items-center justify-center p-3 font-medium text-white rounded-lg bg-brand-500 text-theme-sm hover:bg-brand-600"
      >
        Open Dashboard
      </a>

      {dataDir && (
        <p className="mt-3 break-all text-[10px] text-gray-400 dark:text-gray-500">
          {dataDir}
        </p>
      )}
    </div>
  );
}

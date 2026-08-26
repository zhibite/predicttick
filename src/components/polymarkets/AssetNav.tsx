"use client";

import { ASSETS, PERIODS, type Asset, type Period } from "@/lib/db/constants";
import { assetIcon } from "@/lib/format";

export interface AssetStat {
  asset: string;
  total: number;
  periods: Partial<Record<Period, number>>;
}

export interface AssetNavProps {
  stats: AssetStat[];
  currentAsset: Asset;
  currentPeriod: Period;
  onSelect: (asset: Asset, period: Period) => void;
  health?: { exists: boolean; dataDir: string } | null;
}

const ASSET_GRADIENT: Record<string, string> = {
  BTC: "from-orange-500 to-amber-600",
  ETH: "from-indigo-500 to-violet-600",
  BNB: "from-yellow-500 to-amber-500",
  SOL: "from-emerald-500 to-teal-600",
  XRP: "from-slate-500 to-zinc-600",
  DOGE: "from-yellow-400 to-orange-400",
  HYPE: "from-cyan-500 to-blue-500",
};

function getGradient(asset: string) {
  return ASSET_GRADIENT[asset.toUpperCase()] ?? "from-zinc-500 to-zinc-700";
}

export default function AssetNav({
  stats,
  currentAsset,
  currentPeriod,
  onSelect,
  health,
}: AssetNavProps) {
  const byAsset = new Map<string, AssetStat>();
  for (const s of stats) byAsset.set(s.asset.toLowerCase(), s);

  return (
    <div className="flex flex-col gap-0 rounded-xl border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-900 overflow-hidden mb-5">
      {/* Asset pills */}
      <div className="flex items-center gap-1 px-4 py-3 bg-gray-50 dark:bg-zinc-800/60 overflow-x-auto">
        {ASSETS.map((asset) => {
          const stat = byAsset.get(asset);
          const total = stat?.total ?? 0;
          const active = asset === currentAsset;
          return (
            <button
              key={asset}
              onClick={() => onSelect(asset, active ? currentPeriod : "5m")}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition whitespace-nowrap shrink-0 ${
                active
                  ? "bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm ring-1 ring-gray-200 dark:ring-zinc-600"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-zinc-700/50"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br ${getGradient(asset)} text-white text-xs font-bold`}
              >
                {assetIcon(asset)}
              </span>
              <span className="font-semibold">{asset.toUpperCase()}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">{total}</span>
            </button>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Data source status */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              health?.exists
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400"
            }`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                health?.exists ? "bg-emerald-500 animate-pulse" : "bg-red-500"
              }`}
            />
            {health?.exists ? "Live" : "Offline"}
          </span>
        </div>
      </div>

      {/* Period tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-t border-gray-100 dark:border-zinc-700">
        <span className="mr-1 text-xs text-gray-400 dark:text-gray-500 font-medium">
          {currentAsset.toUpperCase()}
        </span>
        {PERIODS.map((period) => {
          const stat = byAsset.get(currentAsset);
          const count = stat?.periods?.[period] ?? 0;
          const isActive = period === currentPeriod;
          return (
            <button
              key={period}
              onClick={() => onSelect(currentAsset, period)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                isActive
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700"
              }`}
            >
              {period.toUpperCase()}
              <span className="ml-1.5 text-[10px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

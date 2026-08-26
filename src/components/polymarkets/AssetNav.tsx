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
  /** 健康检查：数据源是否可用 */
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
    <aside className="flex h-full w-64 flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-200">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-zinc-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/20">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 text-white"
          >
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M14 7h7v7" />
          </svg>
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">Polymarket</div>
          <div className="text-[11px] text-zinc-500 leading-tight">Up/Down Monitor</div>
        </div>
      </div>

      {/* Section title */}
      <div className="px-5 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        Assets
      </div>

      {/* Asset list */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {ASSETS.map((asset) => {
          const stat = byAsset.get(asset);
          const total = stat?.total ?? 0;
          const active = asset === currentAsset;
          return (
            <div key={asset} className="mb-1">
              <div
                className={`group flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition ${
                  active
                    ? "bg-zinc-800/80 ring-1 ring-brand-500/30"
                    : "hover:bg-zinc-900"
                }`}
                onClick={() => onSelect(asset, active ? currentPeriod : "5m")}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br ${getGradient(asset)} text-white text-sm font-bold shadow`}
                >
                  {assetIcon(asset)}
                </span>
                <span className="flex-1 text-sm font-medium">{asset.toUpperCase()}</span>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                  {total.toLocaleString()}
                </span>
              </div>

              {/* Period sub-items */}
              {active && (
                <div className="ml-3 mt-1 mb-2 space-y-0.5 border-l border-zinc-800 pl-3">
                  {PERIODS.map((period) => {
                    const count = stat?.periods?.[period] ?? 0;
                    const isActive = period === currentPeriod;
                    return (
                      <div
                        key={period}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(asset, period);
                        }}
                        className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1 text-[12px] transition ${
                          isActive
                            ? "bg-brand-500/15 text-brand-400"
                            : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-1 w-1 rounded-full bg-current opacity-60" />
                          {period.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-zinc-600">{count.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Status footer */}
      <div className="border-t border-zinc-800 px-5 py-3">
        <div className="flex items-center gap-2 text-[11px]">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              health?.exists ? "bg-emerald-500 shadow shadow-emerald-500/40" : "bg-red-500"
            }`}
          />
          <span className={health?.exists ? "text-emerald-400" : "text-red-400"}>
            {health?.exists ? "Data source online" : "Data source offline"}
          </span>
        </div>
        {health?.exists && (
          <div className="mt-1 truncate font-mono text-[10px] text-zinc-600" title={health.dataDir}>
            {health.dataDir}
          </div>
        )}
      </div>
    </aside>
  );
}

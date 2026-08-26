"use client";

import { useCallback, useEffect, useState } from "react";
import type { Asset, Period } from "@/lib/db/constants";
import type { MarketsPageResponse, AssetStat } from "@/types/polymarkets";
import AssetNav from "@/components/polymarkets/AssetNav";
import WindowCard from "@/components/polymarkets/WindowCard";
import Pagination from "@/components/polymarkets/Pagination";
import { assetIcon } from "@/lib/format";

interface Health {
  dataDir: string;
  exists: boolean;
}

export default function PolymarketMonitor() {
  const [asset, setAsset] = useState<Asset>("btc");
  const [period, setPeriod] = useState<Period>("5m");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [stats, setStats] = useState<AssetStat[]>([]);
  const [data, setData] = useState<MarketsPageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  // 加载 stats + health
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [aRes, hRes] = await Promise.all([
          fetch("/api/polymarkets/assets", { cache: "no-store" }),
          fetch("/api/polymarkets/health", { cache: "no-store" }),
        ]);
        const aJson = aRes.ok ? await aRes.json() : { assets: [] };
        const hJson = hRes.ok ? await hRes.json() : null;
        if (cancelled) return;
        setStats(aJson.assets ?? []);
        if (hJson) setHealth({ dataDir: hJson.dataDir, exists: hJson.exists });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 加载市场页
  const loadPage = useCallback(
    async (p: number, ps: number, a: Asset = asset, per: Period = period) => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/polymarkets/markets/${a}/${per}?limit=${ps}&offset=${(p - 1) * ps}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: MarketsPageResponse = await res.json();
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [asset, period],
  );

  // 切换资产 / 周期时重置
  const handleSelect = useCallback(
    (a: Asset, per: Period) => {
      setAsset(a);
      setPeriod(per);
      setPage(1);
      loadPage(1, pageSize, a, per);
    },
    [loadPage, pageSize],
  );

  const handlePageChange = useCallback(
    (p: number, ps: number) => {
      const psChanged = ps !== pageSize;
      setPage(psChanged ? 1 : p);
      setPageSize(ps);
      loadPage(psChanged ? 1 : p, ps);
    },
    [loadPage, pageSize],
  );

  // 初次加载
  useEffect(() => {
    loadPage(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = data?.total ?? 0;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-950 text-zinc-100">
      <AssetNav
        stats={stats}
        currentAsset={asset}
        currentPeriod={period}
        onSelect={handleSelect}
        health={health}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-900/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold text-brand-400">
              {assetIcon(asset)}
            </span>
            <div>
              <h1 className="flex items-center gap-2 text-xl font-semibold">
                {asset.toUpperCase()}
                <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300">
                  {period.toUpperCase()}
                </span>
                <span className="text-sm font-normal text-zinc-500">窗口列表</span>
              </h1>
              <p className="mt-0.5 text-xs text-zinc-500">
                {loading
                  ? "加载中..."
                  : error
                    ? `加载失败：${error}`
                    : `共 ${total.toLocaleString()} 个窗口 · 倒序排列（最新在前）`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
            <span className="rounded-md bg-zinc-800 px-2.5 py-1 text-zinc-400">
              {pageSize} / 页
            </span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && !data && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center">
              <div className="text-4xl mb-2">⚠️</div>
              <div className="text-sm text-red-400">无法连接到数据源</div>
              <div className="mt-2 text-xs text-zinc-500">
                检查 <code className="bg-zinc-900 px-2 py-0.5 rounded">GMGN_DATA_DIR</code>{" "}
                环境变量或数据目录是否可访问。
              </div>
            </div>
          )}

          {!error && data && data.windows.length === 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center text-zinc-500">
              <div className="text-4xl mb-3">📭</div>
              <div>暂无 {asset.toUpperCase()} {period.toUpperCase()} 数据</div>
            </div>
          )}

          {data && data.windows.length > 0 && (
            <>
              <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {data.windows.map((w, i) => (
                  <WindowCard
                    key={w.slug}
                    slug={w.slug}
                    asset={w.asset}
                    period={w.period}
                    startEpoch={w.start_epoch}
                    endEpoch={w.end_epoch}
                    status={w.status}
                    volume={w.volume}
                    up={w.up}
                    down={w.down}
                    index={(page - 1) * pageSize + i}
                  />
                ))}
              </div>
              <div className="mt-6">
                <Pagination
                  page={page}
                  total={total}
                  pageSize={pageSize}
                  onChange={handlePageChange}
                />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

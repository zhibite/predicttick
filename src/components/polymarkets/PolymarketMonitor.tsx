"use client";

import { useCallback, useEffect, useState } from "react";
import type { Asset, Period } from "@/lib/db/constants";
import type { MarketsPageResponse, AssetStat } from "@/types/polymarkets";
import WindowCard from "@/components/polymarkets/WindowCard";
import Pagination from "@/components/polymarkets/Pagination";

interface Health {
  dataDir: string;
  exists: boolean;
}

interface PolymarketMonitorProps {
  initialPeriod?: Period;
  initialAsset?: Asset;
}

export default function PolymarketMonitor({
  initialPeriod = "5m",
  initialAsset = "btc",
}: PolymarketMonitorProps) {
  const [asset, setAsset] = useState<Asset>(initialAsset);
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [stats, setStats] = useState<AssetStat[]>([]);
  const [data, setData] = useState<MarketsPageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  // Load stats + health
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

  // Load market page
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

  // Reset on asset/period change
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

  // Initial load
  useEffect(() => {
    loadPage(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-0">
      {/* Content */}
      {error && !data && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-500/20 dark:bg-red-500/5">
          <div className="text-4xl mb-2">⚠️</div>
          <div className="text-sm text-red-500 font-medium">Cannot connect to data source</div>
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Verify the <code className="bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono">GMGN_DATA_DIR</code>{" "}
            environment variable or data directory is accessible.
          </div>
        </div>
      )}

      {!error && data && data.windows.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 dark:border-zinc-700 dark:bg-zinc-800/40 p-12 text-center text-gray-400 dark:text-gray-500">
          <div className="text-4xl mb-3">📭</div>
          <div>No {asset.toUpperCase()} {period.toUpperCase()} data yet</div>
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
  );
}

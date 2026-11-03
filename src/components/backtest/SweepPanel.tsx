"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  SweepDetail,
  SweepRow,
} from "@/server/backtest/service";

function formatNumber(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    value,
  );
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatUsd(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function statusClass(status: string): string {
  if (status === "done") {
    return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  }
  if (status === "failed" || status === "canceled") {
    return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  }
  if (status === "running") {
    return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  }
  return "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";
}

export default function SweepPanel({
  asset,
  period,
  from,
  to,
  resolvedOnly,
  minSamples,
  stake,
  slippageBps,
  feeBps,
  source,
  params,
  strategyId,
  dirty,
}: {
  asset: string;
  period: string;
  from: string;
  to: string;
  resolvedOnly: boolean;
  minSamples: number;
  stake: number;
  slippageBps: number;
  feeBps: number;
  source: string;
  params: Record<string, unknown>;
  strategyId: string | null;
  dirty: boolean;
}) {
  const [gridText, setGridText] = useState(
    '{\n  "maxAsk": [0.6, 0.8, 0.9]\n}',
  );
  const [sweeps, setSweeps] = useState<SweepRow[]>([]);
  const [selectedSweepId, setSelectedSweepId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SweepDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const hasActive = useMemo(
    () =>
      sweeps.some(
        (sweep) => sweep.status === "queued" || sweep.status === "running",
      ),
    [sweeps],
  );

  const loadDetail = useCallback(async (id: string) => {
    try {
      const response = await fetch(
        `/api/backtest/sweeps/${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as {
        sweep?: SweepDetail;
        error?: { message?: string };
      };
      if (response.ok && body.sweep) setDetail(body.sweep);
      else setError(body.error?.message ?? "Could not load the sweep.");
    } catch {
      setError("Could not load the sweep.");
    }
  }, []);

  const loadSweeps = useCallback(async () => {
    try {
      const response = await fetch("/api/backtest/sweeps", {
        cache: "no-store",
      });
      const body = (await response.json()) as {
        sweeps?: SweepRow[];
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(body.error?.message ?? "Could not load sweeps.");
        return;
      }
      if (body.sweeps) setSweeps(body.sweeps);
      if (selectedSweepId) void loadDetail(selectedSweepId);
    } catch {
      setError("Could not load sweeps.");
    }
  }, [selectedSweepId, loadDetail]);

  useEffect(() => {
    void loadSweeps();
  }, [loadSweeps]);

  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => void loadSweeps(), 3_000);
    return () => clearInterval(timer);
  }, [hasActive, loadSweeps]);

  async function createSweep() {
    setError(null);
    setCreating(true);
    try {
      const grid = JSON.parse(gridText || "{}") as unknown;
      if (!grid || typeof grid !== "object" || Array.isArray(grid)) {
        setError("Grid must be a JSON object of parameter arrays.");
        return;
      }
      const body: Record<string, unknown> = {
        asset,
        period,
        from,
        to,
        resolvedOnly,
        minSamples,
        stake,
        slippageBps,
        feeBps,
        params,
        grid,
      };
      if (strategyId && !dirty) body.strategyId = strategyId;
      else body.source = source;

      const response = await fetch("/api/backtest/sweeps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as {
        sweep?: SweepRow;
        error?: { message?: string };
      };
      if (!response.ok || !result.sweep) {
        setError(result.error?.message ?? "Could not start the sweep.");
        return;
      }
      setSweeps((current) => [result.sweep!, ...current]);
      setSelectedSweepId(result.sweep.id);
      setDetail(null);
      void loadDetail(result.sweep.id);
    } catch (error) {
      setError(
        error instanceof SyntaxError
          ? "Grid must be valid JSON."
          : "Could not start the sweep.",
      );
    } finally {
      setCreating(false);
    }
  }

  const sortedRuns = useMemo(() => {
    if (!detail) return [];
    return [...detail.runs].sort(
      (a, b) => (b.pnl ?? Number.NEGATIVE_INFINITY) - (a.pnl ?? Number.NEGATIVE_INFINITY),
    );
  }, [detail]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
            Parameter sweep <span className="text-xs font-normal text-brand-500">Pro</span>
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Run the current strategy across a grid of parameter combinations.
            Max 20 combinations; results are ranked by PnL.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <label className="text-xs text-gray-500 dark:text-gray-400 lg:col-span-2">
          Grid (JSON object of arrays)
          <textarea
            value={gridText}
            onChange={(event) => setGridText(event.target.value)}
            spellCheck={false}
            rows={4}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-gray-950 p-3 font-mono text-xs leading-5 text-gray-100 dark:border-gray-700"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={createSweep}
            disabled={creating}
            className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {creating ? "Starting..." : "Run sweep"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p>
      )}

      {sweeps.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {sweeps.map((sweep) => (
            <button
              key={sweep.id}
              type="button"
              onClick={() => {
                setSelectedSweepId(sweep.id);
                setDetail(null);
                void loadDetail(sweep.id);
              }}
              className={`rounded-lg border px-3 py-2 text-left text-xs ${
                selectedSweepId === sweep.id
                  ? "border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10"
                  : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-zinc-900 dark:hover:bg-white/5"
              }`}
            >
              <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
                {sweep.id}
              </span>
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] uppercase ${statusClass(sweep.status)}`}>
                {sweep.status}
              </span>
              <span className="ml-2 text-[11px] text-gray-400">
                {sweep.completed_runs}/{sweep.total_runs}
              </span>
            </button>
          ))}
        </div>
      )}

      {detail && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="bg-gray-50 text-gray-500 dark:bg-zinc-800 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2">Params</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Trades</th>
                <th className="px-3 py-2">PnL</th>
                <th className="px-3 py-2">ROI</th>
                <th className="px-3 py-2">Win rate</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300">
              {sortedRuns.map((run, index) => (
                <tr key={run.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-2">{index + 1}</td>
                  <td className="max-w-[320px] px-3 py-2 font-mono text-[11px]">
                    {JSON.stringify(run.params)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${statusClass(run.status)}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{formatNumber(run.trades)}</td>
                  <td className="px-3 py-2">{formatUsd(run.pnl)}</td>
                  <td className="px-3 py-2">{formatPercent(run.roi)}</td>
                  <td className="px-3 py-2">{formatPercent(run.winRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

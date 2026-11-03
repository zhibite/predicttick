"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type {
  BacktestSummary,
  BacktestTrade,
} from "@/server/backtest/engine";
import type {
  RunDetail,
  RunPublic,
  StrategyRow,
} from "@/server/backtest/service";
import type { StrategyExample } from "@/server/backtest/examples";
import type { Entitlements } from "@/server/entitlements";
import type { Usage } from "@/server/usage";
import type { Period } from "@/lib/types";

import EquityCurveChart from "./EquityCurveChart";
import SweepPanel from "./SweepPanel";

interface AssetOption {
  asset: string;
  label: string;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    value,
  );
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSigned(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${formatUsd(value)}`;
}

function formatUtc(epoch: number | null | undefined): string {
  if (epoch == null) return "—";
  return (
    new Date(epoch * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC"
  );
}

function statusClass(status: string): string {
  switch (status) {
    case "done":
      return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
    case "failed":
    case "canceled":
      return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
    case "running":
      return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";
  }
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.floor((end - start) / 86_400) + 1;
}

function addDays(day: string, delta: number): string {
  return new Date(
    Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
}

export default function BacktestRunner({
  isPaid,
  isPro,
  entitlements,
  usage,
  trialUsed,
  strategies: initialStrategies,
  initialRuns,
  examples,
  assets,
  periods,
  defaultFrom,
  defaultTo,
}: {
  isPaid: boolean;
  isPro: boolean;
  entitlements: Entitlements;
  usage: Usage;
  trialUsed: number;
  strategies: StrategyRow[];
  initialRuns: RunPublic[];
  examples: StrategyExample[];
  assets: AssetOption[];
  periods: Period[];
  defaultFrom: string;
  defaultTo: string;
}) {
  const firstExample = examples[0];
  const [asset, setAsset] = useState(assets[0]?.asset ?? "btc");
  const [period, setPeriod] = useState<Period>(periods[0] ?? "5m");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [stake, setStake] = useState("10");
  const [slippageBps, setSlippageBps] = useState("0");
  const [feeBps, setFeeBps] = useState("0");
  const [minSamples, setMinSamples] = useState("0");
  const [resolvedOnly, setResolvedOnly] = useState(true);

  const [source, setSource] = useState(firstExample?.source ?? "");
  const [paramsText, setParamsText] = useState("{}");
  const [strategyName, setStrategyName] = useState(firstExample?.name ?? "");
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(
    null,
  );
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(
    firstExample?.id ?? null,
  );
  const [dirty, setDirty] = useState(false);
  const [strategies, setStrategies] = useState(initialStrategies);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [runs, setRuns] = useState(initialRuns);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    initialRuns[0]?.id ?? null,
  );
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trialRunsUsed, setTrialRunsUsed] = useState(trialUsed);

  const trialRemaining = Math.max(
    0,
    entitlements.backtestTrialRuns - trialRunsUsed,
  );
  const sweepParams = useMemo(() => {
    try {
      const value = JSON.parse(paramsText || "{}") as unknown;
      return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }, [paramsText]);
  const earliestDay = addDays(defaultTo, -(entitlements.historyDays - 1));
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  useEffect(() => {
    if (!selectedRunId) {
      setDetail(null);
      return;
    }
    if (
      !selectedRun ||
      (selectedRun.status !== "done" && selectedRun.status !== "failed")
    ) {
      return;
    }
    if (
      detail?.id === selectedRun.id &&
      detail.status === selectedRun.status
    ) {
      return;
    }

    const controller = new AbortController();
    fetch(`/api/backtest/runs/${encodeURIComponent(selectedRun.id)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          run?: RunDetail;
          error?: { message?: string };
        };
        if (!response.ok || !body.run) {
          setError(body.error?.message ?? "Could not load the backtest.");
          return;
        }
        setDetail(body.run);
      })
      .catch((requestError: Error) => {
        if (requestError.name !== "AbortError") {
          setError("Could not load the backtest.");
        }
      });
    return () => controller.abort();
  }, [selectedRun, selectedRunId, detail]);

  useEffect(() => {
    if (
      !runs.some(
        (run) => run.status === "queued" || run.status === "running",
      )
    ) {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const response = await fetch("/api/backtest/runs", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = (await response.json()) as { runs?: RunPublic[] };
        if (body.runs) setRuns(body.runs);
      } catch {
        // Ignore transient polling errors.
      }
    }, 3_000);
    return () => clearInterval(timer);
  }, [runs]);

  function loadExample(id: string) {
    const example = examples.find((item) => item.id === id);
    if (!example) return;
    setSource(example.source);
    setParamsText("{}");
    setStrategyName(example.name);
    setSelectedExampleId(example.id);
    setSelectedStrategyId(null);
    setDirty(false);
    setSaveMessage(null);
  }

  function loadStrategy(id: string) {
    const strategy = strategies.find((item) => item.id === id);
    if (!strategy) return;
    setSource(strategy.source);
    setParamsText(strategy.params_json);
    setStrategyName(strategy.name);
    setSelectedStrategyId(strategy.id);
    setSelectedExampleId(null);
    setDirty(false);
    setSaveMessage(null);
  }

  function editSource(value: string) {
    setSource(value);
    setSelectedStrategyId(null);
    setSelectedExampleId(null);
    setDirty(true);
    setSaveMessage(null);
  }

  function editParams(value: string) {
    setParamsText(value);
    setSelectedStrategyId(null);
    setSelectedExampleId(null);
    setDirty(true);
    setSaveMessage(null);
  }

  function parsedParams(): Record<string, unknown> | null {
    try {
      const value = JSON.parse(paramsText || "{}") as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        setError("Params must be a JSON object.");
        return null;
      }
      return value as Record<string, unknown>;
    } catch {
      setError("Params must be valid JSON.");
      return null;
    }
  }

  async function saveStrategy() {
    const params = parsedParams();
    if (!params) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const response = await fetch("/api/backtest/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: strategyName || "Untitled strategy",
          source,
          params,
        }),
      });
      const body = (await response.json()) as {
        strategy?: StrategyRow;
        error?: { message?: string };
      };
      if (!response.ok || !body.strategy) {
        setError(body.error?.message ?? "Could not save the strategy.");
        return;
      }
      setStrategies((current) => [body.strategy!, ...current]);
      setSelectedStrategyId(body.strategy.id);
      setSelectedExampleId(null);
      setDirty(false);
      setSaveMessage("Strategy saved.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function runBacktest() {
    const params = parsedParams();
    if (!params) return;
    if (!isPaid && trialRemaining <= 0) {
      setError("Your trial runs are used up. Upgrade to continue.");
      return;
    }
    if (!isPaid && !selectedExampleId) {
      setError("Choose a built-in example strategy for a trial run.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        asset,
        period,
        from,
        to,
        resolvedOnly,
        minSamples: Number(minSamples) || 0,
        stake: Number(stake) || 0,
        slippageBps: Number(slippageBps) || 0,
        feeBps: Number(feeBps) || 0,
        params,
      };
      if (!isPaid) {
        body.exampleId = selectedExampleId;
      } else if (selectedStrategyId && !dirty) {
        body.strategyId = selectedStrategyId;
      } else {
        body.source = source;
      }

      const response = await fetch("/api/backtest/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as {
        run?: { id: string; status: string };
        error?: { message?: string };
      };
      if (!response.ok || !result.run) {
        setError(result.error?.message ?? "Could not start the backtest.");
        return;
      }
      setSelectedRunId(result.run.id);
      setDetail(null);
      if (!isPaid) setTrialRunsUsed((value) => value + 1);
      setRuns((current) => [
        {
          id: result.run!.id,
          created_at: Math.floor(Date.now() / 1000),
          started_at: null,
          finished_at: null,
          status: result.run!.status,
          progress: 0,
          strategy_id: selectedStrategyId,
          strategy_version: null,
          trial: !isPaid,
          mode: null,
          error: null,
          summary: null,
        },
        ...current,
      ]);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  const days = daysBetween(from, to);

  async function cancelSelectedRun() {
    if (!selectedRunId) return;
    setCanceling(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/backtest/runs/${encodeURIComponent(selectedRunId)}/cancel`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(body.error?.message ?? "Could not cancel the backtest.");
        return;
      }
      const list = await fetch("/api/backtest/runs", { cache: "no-store" });
      if (list.ok) {
        const payload = (await list.json()) as { runs?: RunPublic[] };
        if (payload.runs) setRuns(payload.runs);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCanceling(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {isPaid ? "Paid plan" : "Free trial"}
        </span>
        <span>
          {isPaid
            ? `${entitlements.backtestRunsPerDay} runs/day · max ${entitlements.backtestMaxDays} days · ${entitlements.backtestMaxWindows.toLocaleString("en-US")} windows`
            : `${trialRemaining} of ${entitlements.backtestTrialRuns} trial runs left · max ${entitlements.backtestMaxDays} days`}
        </span>
        <span>·</span>
        <span>
          Today: {usage.backtestRuns} runs · {usage.backtestWindows.toLocaleString("en-US")} windows
        </span>
        {!isPaid && trialRemaining <= 0 && (
          <Link href="/pricing" className="text-brand-500 underline">
            Upgrade
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
                Strategy
              </h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {isPaid
                  ? "Point: onWindow(ctx). Stream: onSample(ctx, sample). No network or filesystem."
                  : "Free trial runs use built-in examples only."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedExampleId ?? ""}
                onChange={(event) => loadExample(event.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-zinc-900 dark:text-gray-300"
              >
                <option value="">Load example…</option>
                {examples.map((example) => (
                  <option key={example.id} value={example.id}>
                    {example.name}
                  </option>
                ))}
              </select>
              {isPaid && (
                <select
                  value={selectedStrategyId ?? ""}
                  onChange={(event) => loadStrategy(event.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-zinc-900 dark:text-gray-300"
                >
                  <option value="">Load saved…</option>
                  {strategies.map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>
                      {strategy.name} (v{strategy.version})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              Name
              <input
                value={strategyName}
                onChange={(event) => setStrategyName(event.target.value)}
                readOnly={!isPaid}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 read-only:opacity-60 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
              />
            </label>
          </div>

          <div className="mt-4">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              JavaScript
            </label>
            <textarea
              value={source}
              onChange={(event) => editSource(event.target.value)}
              readOnly={!isPaid}
              spellCheck={false}
              rows={18}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-gray-950 p-4 font-mono text-xs leading-5 text-gray-100 read-only:opacity-70 dark:border-gray-700"
            />
          </div>

          <div className="mt-4">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              Params (JSON)
            </label>
            <textarea
              value={paramsText}
              onChange={(event) => editParams(event.target.value)}
              readOnly={!isPaid}
              spellCheck={false}
              rows={4}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-gray-950 p-4 font-mono text-xs leading-5 text-gray-100 read-only:opacity-70 dark:border-gray-700"
            />
          </div>

          {isPaid && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={saveStrategy}
                disabled={saving}
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                {saving ? "Saving..." : "Save as new strategy"}
              </button>
              {saveMessage && (
                <span className="text-xs text-success-600 dark:text-success-400">
                  {saveMessage}
                </span>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
            Run settings
          </h2>
          <div className="mt-4 space-y-3">
            <label className="block text-xs text-gray-500 dark:text-gray-400">
              Asset
              <select
                value={asset}
                onChange={(event) => setAsset(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
              >
                {assets.map((item) => (
                  <option key={item.asset} value={item.asset}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-gray-500 dark:text-gray-400">
              Market period
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value as Period)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
              >
                {periods.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-gray-500 dark:text-gray-400">
                From (UTC)
                <input
                  type="date"
                  value={from}
                  min={earliestDay}
                  max={to}
                  onChange={(event) => setFrom(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2.5 text-xs text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
                />
              </label>
              <label className="block text-xs text-gray-500 dark:text-gray-400">
                To (UTC)
                <input
                  type="date"
                  value={to}
                  min={from}
                  max={defaultTo}
                  onChange={(event) => setTo(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2.5 text-xs text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
                />
              </label>
            </div>
            <p className="text-[11px] text-gray-400">
              {days} days selected · max {entitlements.backtestMaxDays}
            </p>
            <label className="block text-xs text-gray-500 dark:text-gray-400">
              Stake per trade (USD)
              <input
                type="number"
                min="0"
                step="0.01"
                value={stake}
                onChange={(event) => setStake(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-gray-500 dark:text-gray-400">
                Slippage (bps)
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={slippageBps}
                  onChange={(event) => setSlippageBps(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2.5 text-xs text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
                />
              </label>
              <label className="block text-xs text-gray-500 dark:text-gray-400">
                Fee (bps)
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={feeBps}
                  onChange={(event) => setFeeBps(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2.5 text-xs text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
                />
              </label>
            </div>
            <label className="block text-xs text-gray-500 dark:text-gray-400">
              Min samples per window
              <input
                type="number"
                min="0"
                max="10000"
                value={minSamples}
                onChange={(event) => setMinSamples(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={resolvedOnly}
                onChange={(event) => setResolvedOnly(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-600"
              />
              Resolved markets only
            </label>
          </div>

          {error && (
            <p className="mt-4 text-sm text-error-600 dark:text-error-400">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={runBacktest}
            disabled={creating || (!isPaid && trialRemaining <= 0)}
            className="mt-5 w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating
              ? "Starting..."
              : !isPaid
                ? `Run trial (${trialRemaining} left)`
                : "Run backtest"}
          </button>
          <p className="mt-3 text-[11px] text-gray-400">
            Fills use ask on entry and bid on exit; open positions settle at
            1 or 0. Results are saved to your account.
          </p>
        </section>
      </div>

      {isPro && (
        <SweepPanel
          asset={asset}
          period={period}
          from={from}
          to={to}
          resolvedOnly={resolvedOnly}
          minSamples={Number(minSamples) || 0}
          stake={Number(stake) || 0}
          slippageBps={Number(slippageBps) || 0}
          feeBps={Number(feeBps) || 0}
          source={source}
          params={sweepParams}
          strategyId={selectedStrategyId}
          dirty={dirty}
        />
      )}

      {selectedRun &&
        (selectedRun.status === "queued" || selectedRun.status === "running") && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning-200 bg-warning-50 px-5 py-4 dark:border-warning-500/30 dark:bg-warning-500/10">
            <div>
              <p className="text-sm font-medium text-warning-700 dark:text-warning-400">
                {selectedRun.status === "queued"
                  ? "This backtest is queued."
                  : "This backtest is running."}
              </p>
              <p className="mt-1 text-xs text-warning-600 dark:text-warning-400">
                Cancel stops the worker at the next 25-window checkpoint.
              </p>
            </div>
            <button
              type="button"
              onClick={cancelSelectedRun}
              disabled={canceling}
              className="rounded-lg border border-error-300 px-4 py-2 text-sm font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:border-error-500/40 dark:text-error-400 dark:hover:bg-error-500/10"
            >
              {canceling ? "Canceling..." : "Cancel backtest"}
            </button>
          </div>
        )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
            Recent runs
          </h2>
          <span className="text-xs text-gray-400">{runs.length} run(s)</span>
        </div>
        {runs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No backtests yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
            {runs.map((run) => {
              const summary = run.summary;
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`block w-full border-b border-gray-100 px-4 py-3 text-left last:border-b-0 dark:border-gray-800 ${
                    run.id === selectedRunId
                      ? "bg-brand-50 dark:bg-brand-500/10"
                      : "bg-white hover:bg-gray-50 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                        {run.id}
                        {run.trial ? " · trial" : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {formatUtc(run.created_at)}
                        {summary
                          ? ` · ${summary.trades} trades · ${formatSigned(summary.pnl)} · ${formatPercent(summary.winRate)} win`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${statusClass(run.status)}`}
                    >
                      {run.status}
                    </span>
                  </div>
                  {(run.status === "queued" || run.status === "running") && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{
                          width: `${Math.max(2, Math.round(run.progress * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                  {run.error && (
                    <p className="mt-1 text-xs text-error-600 dark:text-error-400">
                      {run.error}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {detail?.summary && <BacktestResult detail={detail} />}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.02]">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

function BacktestResult({ detail }: { detail: RunDetail }) {
  const summary: BacktestSummary = detail.summary!;
  const trades: BacktestTrade[] = detail.trades.slice(0, 200);
  const equityPoints = summary.equityCurve ?? [];
  const equity = equityPoints.slice(-200);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
            Result · {summary.mode} mode
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {summary.asset.toUpperCase()} / {summary.period} · {summary.from} to{" "}
            {summary.to} · {summary.windows.toLocaleString("en-US")} windows ·{" "}
            {summary.trades} trades · {formatNumber(summary.durationMs / 1000)}s
          </p>
        </div>
        <span className="text-xs text-gray-400">
          {summary.engineVersion} · data cutoff {formatUtc(summary.dataCutoff)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Metric label="Win rate" value={formatPercent(summary.winRate)} hint={`${summary.wins}W / ${summary.losses}L`} />
        <Metric label="PnL" value={formatSigned(summary.pnl)} hint={`Staked ${formatUsd(summary.totalStaked)}`} />
        <Metric label="ROI" value={formatPercent(summary.roi)} />
        <Metric label="Max drawdown" value={formatUsd(summary.maxDrawdown)} />
        <Metric label="Brier" value={formatNumber(summary.brier)} hint="lower is better" />
        <Metric label="Profit factor" value={formatNumber(summary.profitFactor)} />
        <Metric label="Avg entry" value={formatNumber(summary.avgEntry)} />
        <Metric label="Edge" value={formatPercent(summary.edge)} />
        <Metric label="Sharpe" value={formatNumber(summary.sharpe)} hint="per-trade" />
        <Metric label="Windows" value={formatNumber(summary.windows)} />
        <Metric label="Unresolved" value={formatNumber(summary.skipped.unresolved)} />
        <Metric label="No trade" value={formatNumber(summary.skipped.noTrade)} />
      </div>

      <div className="mt-5">
        <EquityCurveChart points={equityPoints} />
        <details className="mt-3">
          <summary className="cursor-pointer select-none text-xs font-medium text-gray-600 dark:text-gray-300">
            Equity data table ({equity.length} of {equityPoints.length} points)
          </summary>
          <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="sticky top-0 bg-gray-50 text-gray-500 dark:bg-zinc-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Entry</th>
                  <th className="px-3 py-2">Trade PnL</th>
                  <th className="px-3 py-2">Cumulative</th>
                </tr>
              </thead>
              <tbody className="text-gray-700 dark:text-gray-300">
                {equity.map((point, index) => (
                  <tr key={`${point.t}-${index}`} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-1.5">{formatUtc(point.t)}</td>
                    <td className="px-3 py-1.5">{formatSigned(point.pnl)}</td>
                    <td className="px-3 py-1.5">{formatSigned(point.cumPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
            Calibration
          </h3>
          <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="bg-gray-50 text-gray-500 dark:bg-zinc-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Trades</th>
                  <th className="px-3 py-2">Win rate</th>
                  <th className="px-3 py-2">Avg price</th>
                </tr>
              </thead>
              <tbody className="text-gray-700 dark:text-gray-300">
                {summary.calibration.map((bucket) => (
                  <tr key={bucket.label} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-1.5">{bucket.label}</td>
                    <td className="px-3 py-1.5">{bucket.count}</td>
                    <td className="px-3 py-1.5">{formatPercent(bucket.winRate)}</td>
                    <td className="px-3 py-1.5">{formatNumber(bucket.avgPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
            By day
          </h3>
          <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="sticky top-0 bg-gray-50 text-gray-500 dark:bg-zinc-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Day (UTC)</th>
                  <th className="px-3 py-2">Trades</th>
                  <th className="px-3 py-2">Wins</th>
                  <th className="px-3 py-2">PnL</th>
                </tr>
              </thead>
              <tbody className="text-gray-700 dark:text-gray-300">
                {Object.entries(summary.byDay)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([day, item]) => (
                    <tr key={day} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-3 py-1.5">{day}</td>
                      <td className="px-3 py-1.5">{item.trades}</td>
                      <td className="px-3 py-1.5">{item.wins}</td>
                      <td className="px-3 py-1.5">{formatSigned(item.pnl)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
          Trades <span className="text-xs font-normal text-gray-400">(first {trades.length})</span>
        </h3>
        <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="sticky top-0 bg-gray-50 text-gray-500 dark:bg-zinc-800 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2">Entry</th>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2">Side</th>
                <th className="px-3 py-2">Entry</th>
                <th className="px-3 py-2">Exit</th>
                <th className="px-3 py-2">Resolution</th>
                <th className="px-3 py-2">PnL</th>
                <th className="px-3 py-2">Return</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300">
              {trades.map((trade) => (
                <tr key={trade.seq} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-1.5">{formatUtc(trade.entryTs)}</td>
                  <td className="max-w-[220px] truncate px-3 py-1.5 font-mono text-[11px]">{trade.slug}</td>
                  <td className="px-3 py-1.5">{trade.side}</td>
                  <td className="px-3 py-1.5">{formatNumber(trade.entryPrice)}</td>
                  <td className="px-3 py-1.5">{formatNumber(trade.exitPrice)}</td>
                  <td className="px-3 py-1.5">{trade.resolution}</td>
                  <td className={`px-3 py-1.5 ${trade.pnl >= 0 ? "text-success-600 dark:text-success-400" : "text-error-600 dark:text-error-400"}`}>
                    {formatSigned(trade.pnl)}
                  </td>
                  <td className="px-3 py-1.5">{formatPercent(trade.returnPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

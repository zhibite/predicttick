"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import {
  PAPER_ASSETS,
  PAPER_PERIODS,
  defaultPaperConfigJson,
} from "@/lib/paper-defaults";
import {
  formatEpochUtc,
  formatPercentPoints,
  formatSignedUsd,
  formatUsd,
  pnlTextClass,
} from "@/lib/leaderboard-format";
import type {
  PaperStrategyKind,
  PaperStrategySummary,
} from "@/server/paper/types";

interface ApiError {
  error?: { message?: string };
}

interface StrategiesResponse extends ApiError {
  strategies?: PaperStrategySummary[];
}

interface StrategyResponse extends ApiError {
  strategy?: PaperStrategySummary;
}

const KIND_LABELS: Record<PaperStrategyKind, string> = {
  pair_lock: "Pair lock",
  mid_maker: "Mid maker (copy)",
};

export default function PaperStrategies({
  initialStrategies,
}: {
  initialStrategies: PaperStrategySummary[];
}) {
  const [rows, setRows] = useState(initialStrategies);
  const [name, setName] = useState("BTC 5m maker copy");
  const [kind, setKind] = useState<PaperStrategyKind>("mid_maker");
  const [asset, setAsset] = useState("btc");
  const [period, setPeriod] = useState("5m");
  const [startingBalance, setStartingBalance] = useState("1000");
  const [configText, setConfigText] = useState(() =>
    defaultPaperConfigJson("mid_maker"),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  function replaceRow(row: PaperStrategySummary) {
    setRows((current) =>
      current.map((item) => (item.id === row.id ? row : item)),
    );
  }

  async function refresh() {
    try {
      const response = await fetch("/api/admin/paper/strategies", {
        cache: "no-store",
      });
      const body = (await response.json()) as StrategiesResponse;
      if (response.ok && body.strategies) setRows(body.strategies);
    } catch {
      // Keep the last known state.
    }
  }

  useEffect(() => {
    const timer = setInterval(refresh, 10_000);
    return () => clearInterval(timer);
  }, []);

  function changeKind(next: PaperStrategyKind) {
    setKind(next);
    setConfigText(defaultPaperConfigJson(next));
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    let config: unknown;
    try {
      config = JSON.parse(configText) as unknown;
    } catch {
      setMessage({ kind: "error", text: "Config must be valid JSON." });
      return;
    }

    setBusy("create");
    try {
      const response = await fetch("/api/admin/paper/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          kind,
          asset,
          period,
          startingBalance: Number(startingBalance),
          config,
        }),
      });
      const body = (await response.json()) as StrategyResponse;
      if (!response.ok || !body.strategy) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not create the strategy.",
        });
        return;
      }
      setRows((current) => [...current, body.strategy!]);
      setMessage({
        kind: "success",
        text: "Strategy created. Start it when you are ready.",
      });
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function toggle(row: PaperStrategySummary) {
    setBusy(`toggle:${row.id}`);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/paper/strategies/${encodeURIComponent(row.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: row.active !== 1 }),
        },
      );
      const body = (await response.json()) as StrategyResponse;
      if (!response.ok || !body.strategy) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not update the strategy.",
        });
        return;
      }
      replaceRow(body.strategy);
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function reset(row: PaperStrategySummary) {
    if (
      !window.confirm(
        `Reset "${row.name}"? All paper trades, positions, settlements and equity history will be deleted.`,
      )
    ) {
      return;
    }
    setBusy(`reset:${row.id}`);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/paper/strategies/${encodeURIComponent(row.id)}/reset`,
        { method: "POST" },
      );
      const body = (await response.json()) as StrategyResponse;
      if (!response.ok || !body.strategy) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not reset the strategy.",
        });
        return;
      }
      replaceRow(body.strategy);
      setMessage({ kind: "success", text: "Strategy reset." });
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: PaperStrategySummary) {
    if (
      !window.confirm(
        `Delete "${row.name}" and all of its paper trade history?`,
      )
    ) {
      return;
    }
    setBusy(`delete:${row.id}`);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/paper/strategies/${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as ApiError;
      if (!response.ok) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not delete the strategy.",
        });
        return;
      }
      setRows((current) => current.filter((item) => item.id !== row.id));
      setMessage({ kind: "success", text: "Strategy deleted." });
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function tickNow() {
    setBusy("tick");
    setMessage(null);
    try {
      const response = await fetch("/api/admin/paper/tick", {
        method: "POST",
      });
      const body = (await response.json()) as {
        trades?: number;
        settlements?: number;
        errors?: string[];
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not run a paper tick.",
        });
        return;
      }
      setMessage({
        kind: body.errors && body.errors.length > 0 ? "error" : "success",
        text:
          `Tick finished: ${body.trades ?? 0} trades, ${body.settlements ?? 0} settlements` +
          (body.errors && body.errors.length > 0
            ? `; ${body.errors.join("; ")}`
            : "."),
      });
      await refresh();
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={create}
        className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
          Create a paper strategy
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Paper trading only. No private key, signature or real order is used.
          Active strategies are evaluated against the latest 1-second book
          snapshot every few seconds.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="paper-name">Name</Label>
            <Input
              id="paper-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="paper-kind">Strategy</Label>
            <select
              id="paper-kind"
              value={kind}
              onChange={(event) =>
                changeKind(event.target.value as PaperStrategyKind)
              }
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
            >
              <option value="mid_maker">Mid maker (copy the tracked trader)</option>
              <option value="pair_lock">Pair lock (Up + Down &lt; $1)</option>
            </select>
          </div>
          <div>
            <Label htmlFor="paper-asset">Asset</Label>
            <select
              id="paper-asset"
              value={asset}
              onChange={(event) => setAsset(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
            >
              {PAPER_ASSETS.map((value) => (
                <option key={value} value={value}>
                  {value.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="paper-period">Period</Label>
            <select
              id="paper-period"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
            >
              {PAPER_PERIODS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="paper-balance">Starting balance (USDC)</Label>
            <Input
              id="paper-balance"
              type="number"
              value={startingBalance}
              onChange={(event) => setStartingBalance(event.target.value)}
            />
          </div>
          <div className="lg:col-span-2">
            <Label htmlFor="paper-config">Config JSON</Label>
            <textarea
              id="paper-config"
              value={configText}
              onChange={(event) => setConfigText(event.target.value)}
              rows={12}
              spellCheck={false}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 font-mono text-xs text-gray-800 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
            />
            <p className="mt-1 text-xs text-gray-400">
              Mid maker defaults exclude the 30–60s and 3–4m windows because the
              target&apos;s markout was negative there. Set{" "}
              <code>makerRebateBps</code> to about 45 to approximate the
              observed 0.45% maker rebate rate.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy !== null}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy === "create" ? "Creating…" : "Create strategy"}
          </button>
          <button
            type="button"
            onClick={tickNow}
            disabled={busy !== null}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            {busy === "tick" ? "Ticking…" : "Run one tick now"}
          </button>
        </div>
      </form>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.kind === "error"
              ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
              : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center dark:border-gray-700">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            No paper strategies yet.
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Create a mid-maker strategy to paper trade the tracked trader&apos;s
            behaviour, or a pair-lock strategy to test the Up + Down &lt; $1
            arbitrage.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Strategy</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Equity</th>
                <th className="px-4 py-3 text-right font-medium">Return</th>
                <th className="px-4 py-3 text-right font-medium">Realized</th>
                <th className="px-4 py-3 text-right font-medium">Open</th>
                <th className="px-4 py-3 text-right font-medium">Trades</th>
                <th className="px-4 py-3 text-left font-medium">Last tick</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-gray-100 align-top dark:border-gray-800"
                >
                  <td className="px-4 py-4">
                    <Link
                      href={`/admin/paper/${row.id}`}
                      className="font-medium text-gray-800 hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-400"
                    >
                      {row.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {KIND_LABELS[row.kind]} · {row.asset.toUpperCase()} ·{" "}
                      {row.period}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {row.open_positions} open · {row.trade_count} trades ·{" "}
                      {row.settlement_count} settled
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        row.active === 1
                          ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                          : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                      }`}
                    >
                      {row.active === 1 ? "running" : "paused"}
                    </span>
                    {row.last_error && (
                      <p className="mt-1 line-clamp-2 max-w-[180px] text-[10px] text-error-600 dark:text-error-400">
                        {row.last_error}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right font-medium tabular-nums text-gray-800 dark:text-white/90">
                    {formatUsd(row.equity)}
                  </td>
                  <td
                    className={`px-4 py-4 text-right tabular-nums ${pnlTextClass(
                      row.return_pct,
                    )}`}
                  >
                    {formatPercentPoints(row.return_pct, 2)}
                  </td>
                  <td
                    className={`px-4 py-4 text-right tabular-nums ${pnlTextClass(
                      row.realized_pnl,
                    )}`}
                  >
                    {formatSignedUsd(row.realized_pnl)}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {formatUsd(row.positions_value)}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {row.trade_count}
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-500 dark:text-gray-400">
                    {formatEpochUtc(row.last_tick_at)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => toggle(row)}
                        disabled={busy !== null}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                      >
                        {busy === `toggle:${row.id}`
                          ? "…"
                          : row.active === 1
                            ? "Pause"
                            : "Start"}
                      </button>
                      <Link
                        href={`/admin/paper/${row.id}`}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                      >
                        Detail
                      </Link>
                      <button
                        type="button"
                        onClick={() => reset(row)}
                        disabled={busy !== null}
                        className="rounded-md border border-warning-300 px-3 py-1.5 text-xs font-medium text-warning-700 hover:bg-warning-50 disabled:opacity-50 dark:border-warning-500/40 dark:text-warning-400 dark:hover:bg-warning-500/10"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(row)}
                        disabled={busy !== null}
                        className="rounded-md border border-error-300 px-3 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:border-error-500/40 dark:text-error-400 dark:hover:bg-error-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        <p className="font-medium text-gray-700 dark:text-gray-300">
          Fill model and limits
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Pair lock assumes both legs fill at the current asks when the pair
            cost is below $1 by the configured edge; it does not model leg risk.
          </li>
          <li>
            Mid maker places a simulated bid at{" "}
            <code>min(bestBid, mid − minEdge)</code> and fills only when a new
            last-trade print at or below that price appears. This is a
            conservative approximation of resting-order queue priority.
          </li>
          <li>
            All fees and rebates are configurable. Set{" "}
            <code>makerRebateBps</code> to 45 to approximate the tracked
            trader&apos;s observed 0.45% maker rebate.
          </li>
          <li>
            Open positions are marked to the latest mid and settled when the
            collector resolves the 5m/15m/1h/4h market (UP or DOWN).
          </li>
        </ul>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import PaperEquityChart from "@/components/paper/PaperEquityChart";
import {
  formatEpochUtc,
  formatPercentPoints,
  formatPricePoints,
  formatSignedUsd,
  formatUsd,
  pnlTextClass,
} from "@/lib/leaderboard-format";
import type {
  PaperStrategyDetail,
  PaperStrategySummary,
  PaperTradeRow,
} from "@/server/paper/types";

const KIND_LABELS: Record<string, string> = {
  pair_lock: "Pair lock",
  mid_maker: "Mid maker (copy)",
};

function signalSummary(trade: PaperTradeRow): string {
  if (!trade.signal_json) return "—";
  try {
    const signal = JSON.parse(trade.signal_json) as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof signal.window === "string") parts.push(signal.window);
    if (typeof signal.discount === "number") {
      parts.push(`discount ${signal.discount.toFixed(4)}`);
    }
    if (typeof signal.edge === "number") {
      parts.push(`edge ${signal.edge.toFixed(4)}`);
    }
    if (typeof signal.quote === "number") {
      parts.push(`quote ${signal.quote.toFixed(3)}`);
    }
    if (typeof signal.shares === "number") {
      parts.push(`shares ${signal.shares.toFixed(2)}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "—";
  } catch {
    return "—";
  }
}

function summarizeMarkout(values: Array<number | null>): {
  average: number | null;
  count: number;
  positiveShare: number | null;
} {
  const valid = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  if (valid.length === 0) {
    return { average: null, count: 0, positiveShare: null };
  }
  return {
    average: valid.reduce((sum, value) => sum + value, 0) / valid.length,
    count: valid.length,
    positiveShare:
      (valid.filter((value) => value > 0).length / valid.length) * 100,
  };
}

function MarkoutMetric({
  label,
  values,
}: {
  label: string;
  values: Array<number | null>;
}) {
  const summary = summarizeMarkout(values);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${pnlTextClass(
          summary.average,
        )}`}
      >
        {formatPricePoints(summary.average)}
      </p>
      <p className="mt-1 text-[11px] text-gray-400">
        {summary.count} fills
        {summary.positiveShare == null
          ? ""
          : ` · ${formatPercentPoints(summary.positiveShare, 0)} positive`}
      </p>
    </div>
  );
}

function MarkoutBadge({ status }: { status: string }) {
  const style =
    status === "COMPLETE"
      ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
      : status === "PARTIAL"
        ? "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400"
        : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
        active
          ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
          : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
      }`}
    >
      {active ? "running" : "paused"}
    </span>
  );
}

function Metric({
  label,
  value,
  hint,
  valueClass = "text-gray-800 dark:text-white/90",
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export default function PaperStrategyDetailView({
  initialDetail,
}: {
  initialDetail: PaperStrategyDetail;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const strategy = detail.strategy;

  async function refresh() {
    try {
      const response = await fetch(
        `/api/admin/paper/strategies/${encodeURIComponent(strategy.id)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as {
        strategy?: PaperStrategySummary;
        positions?: PaperStrategyDetail["positions"];
        trades?: PaperStrategyDetail["trades"];
        settlements?: PaperStrategyDetail["settlements"];
        equity?: PaperStrategyDetail["equity"];
      };
      if (response.ok && body.strategy) {
        setDetail({
          strategy: body.strategy,
          positions: body.positions ?? [],
          trades: body.trades ?? [],
          settlements: body.settlements ?? [],
          equity: body.equity ?? [],
        });
      }
    } catch {
      // Keep the last known state.
    }
  }

  useEffect(() => {
    if (strategy.active !== 1) return;
    const timer = setInterval(refresh, 5_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy.active, strategy.id]);

  async function toggle() {
    setBusy("toggle");
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/paper/strategies/${encodeURIComponent(strategy.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: strategy.active !== 1 }),
        },
      );
      const body = (await response.json()) as {
        strategy?: PaperStrategySummary;
        error?: { message?: string };
      };
      if (!response.ok || !body.strategy) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not update the strategy.",
        });
        return;
      }
      setDetail((current) => ({ ...current, strategy: body.strategy! }));
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (
      !window.confirm(
        "Reset this strategy? All trades, positions, settlements and equity history will be deleted.",
      )
    ) {
      return;
    }
    setBusy("reset");
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/paper/strategies/${encodeURIComponent(strategy.id)}/reset`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        strategy?: PaperStrategySummary;
        error?: { message?: string };
      };
      if (!response.ok || !body.strategy) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not reset the strategy.",
        });
        return;
      }
      setDetail({
        strategy: body.strategy,
        positions: [],
        trades: [],
        settlements: [],
        equity: [],
      });
      setMessage({ kind: "success", text: "Strategy reset." });
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete "${strategy.name}" and all of its paper trade history?`,
      )
    ) {
      return;
    }
    setBusy("delete");
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/paper/strategies/${encodeURIComponent(strategy.id)}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not delete the strategy.",
        });
        return;
      }
      router.push("/admin/paper");
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  const openPositions = detail.positions.filter(
    (position) => position.status === "OPEN",
  );
  let configText = strategy.config_json;
  try {
    configText = JSON.stringify(JSON.parse(strategy.config_json), null, 2);
  } catch {
    // Keep the raw config if it is not valid JSON.
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/paper"
            className="text-sm text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400"
          >
            ← Paper strategies
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
              {strategy.name}
            </h2>
            <StatusBadge active={strategy.active === 1} />
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-white/10 dark:text-gray-400">
              {KIND_LABELS[strategy.kind] ?? strategy.kind}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {strategy.asset.toUpperCase()} · {strategy.period} · created{" "}
            {formatEpochUtc(strategy.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={busy !== null}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={toggle}
            disabled={busy !== null}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy === "toggle"
              ? "…"
              : strategy.active === 1
                ? "Pause"
                : "Start"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={busy !== null}
            className="rounded-lg border border-warning-300 px-4 py-2 text-sm font-medium text-warning-700 hover:bg-warning-50 disabled:opacity-50 dark:border-warning-500/40 dark:text-warning-400 dark:hover:bg-warning-500/10"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy !== null}
            className="rounded-lg border border-error-300 px-4 py-2 text-sm font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:border-error-500/40 dark:text-error-400 dark:hover:bg-error-500/10"
          >
            Delete
          </button>
        </div>
      </div>

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

      {strategy.last_error && (
        <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          Last engine error: {strategy.last_error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Equity"
          value={formatUsd(strategy.equity)}
          hint={`starting ${formatUsd(strategy.starting_balance)}`}
        />
        <Metric
          label="Return"
          value={formatPercentPoints(strategy.return_pct, 2)}
          hint={`cash ${formatUsd(strategy.cash)}`}
          valueClass={pnlTextClass(strategy.return_pct)}
        />
        <Metric
          label="Realized PnL"
          value={formatSignedUsd(strategy.realized_pnl)}
          hint={`${strategy.settlement_count} settled positions`}
          valueClass={pnlTextClass(strategy.realized_pnl)}
        />
        <Metric
          label="Open positions"
          value={formatUsd(strategy.positions_value)}
          hint={`${strategy.open_positions} open · marked to latest mid`}
        />
        <Metric
          label="Trades"
          value={strategy.trade_count.toLocaleString("en-US")}
          hint="all paper fills"
        />
        <Metric
          label="Fees / rebates"
          value={formatSignedUsd(strategy.fees_paid)}
          hint="negative means net rebate"
          valueClass={pnlTextClass(-strategy.fees_paid)}
        />
        <Metric
          label="Last tick"
          value={formatEpochUtc(strategy.last_tick_at)}
          hint="engine heartbeat"
        />
        <Metric
          label="Config"
          value={`${strategy.config_json.length} bytes`}
          hint="see JSON below"
        />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="mb-4 text-sm font-medium text-gray-800 dark:text-white/90">
          Equity curve
        </h3>
        <PaperEquityChart points={detail.equity} />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
            Execution quality / markout
          </h3>
          <p className="text-xs text-gray-400">
            Entry edge vs mid, then mid drift at +1s / +10s / +60s / settlement
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <MarkoutMetric
            label="Entry edge"
            values={detail.trades.map((trade) => trade.entry_edge)}
          />
          <MarkoutMetric
            label="Markout +1s"
            values={detail.trades.map((trade) => trade.markout_1s)}
          />
          <MarkoutMetric
            label="Markout +10s"
            values={detail.trades.map((trade) => trade.markout_10s)}
          />
          <MarkoutMetric
            label="Markout +60s"
            values={detail.trades.map((trade) => trade.markout_60s)}
          />
          <MarkoutMetric
            label="Markout to settlement"
            values={detail.trades.map((trade) => trade.markout_end)}
          />
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Completed markouts
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-gray-800 dark:text-white/90">
              {
                detail.trades.filter(
                  (trade) => trade.markout_status === "COMPLETE",
                ).length
              }
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              {detail.trades.length} fills in this view
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Entry edge = mid at fill − fill price. Markouts = later mid − mid at
          fill. The paper engine fills them in the background; values stay
          pending until the corresponding sample exists. Settlement markout is
          capped at market end, not redemption.
        </p>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
          Config
        </h3>
        <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-700 dark:bg-black/20 dark:text-gray-300">
          {configText}
        </pre>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
            Positions
          </h3>
          <p className="text-xs text-gray-400">
            {openPositions.length} open · {detail.positions.length} shown
          </p>
        </div>
        {detail.positions.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            No positions yet. Start the strategy to let the paper engine trade.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1000px] w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Market</th>
                  <th className="px-3 py-2 text-left font-medium">Side</th>
                  <th className="px-3 py-2 text-right font-medium">Shares</th>
                  <th className="px-3 py-2 text-right font-medium">Avg</th>
                  <th className="px-3 py-2 text-right font-medium">Last</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-right font-medium">Fees</th>
                  <th className="px-3 py-2 text-right font-medium">PnL</th>
                  <th className="px-3 py-2 text-right font-medium">Opened</th>
                </tr>
              </thead>
              <tbody>
                {detail.positions.map((position) => {
                  const pnl =
                    position.status === "SETTLED"
                      ? position.realized_pnl ?? 0
                      : (position.last_value ?? 0) - position.cost;
                  return (
                    <tr
                      key={position.id}
                      className="border-t border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-3 pr-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                            position.status === "OPEN"
                              ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                              : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                          }`}
                        >
                          {position.status}
                        </span>
                      </td>
                      <td className="max-w-[280px] px-3 py-3 text-gray-700 dark:text-gray-300">
                        <span className="line-clamp-2">
                          {position.title ?? position.slug}
                        </span>
                        <span className="mt-0.5 block font-mono text-[10px] text-gray-400">
                          {position.slug}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-700 dark:text-gray-300">
                        {position.outcome}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {position.shares.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {position.avg_price.toFixed(3)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {position.last_price == null
                          ? "—"
                          : position.last_price.toFixed(3)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatUsd(position.cost)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatSignedUsd(position.fees)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right tabular-nums ${pnlTextClass(pnl)}`}
                      >
                        {formatSignedUsd(pnl)}
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-gray-500">
                        {formatEpochUtc(position.opened_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
          Trade records
        </h3>
        {detail.trades.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            No paper trades recorded yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1500px] w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="py-2 text-left font-medium">Time</th>
                  <th className="px-3 py-2 text-left font-medium">Market</th>
                  <th className="px-3 py-2 text-left font-medium">Outcome</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Shares</th>
                  <th className="px-3 py-2 text-right font-medium">Notional</th>
                  <th className="px-3 py-2 text-right font-medium">Fee</th>
                  <th className="px-3 py-2 text-right font-medium">Entry edge</th>
                  <th className="px-3 py-2 text-right font-medium">MO +1s</th>
                  <th className="px-3 py-2 text-right font-medium">MO +10s</th>
                  <th className="px-3 py-2 text-right font-medium">MO +60s</th>
                  <th className="px-3 py-2 text-right font-medium">MO end</th>
                  <th className="px-3 py-2 text-left font-medium">MO status</th>
                  <th className="px-3 py-2 text-left font-medium">Reason</th>
                  <th className="px-3 py-2 text-left font-medium">Signal</th>
                </tr>
              </thead>
              <tbody>
                {detail.trades.map((trade) => (
                  <tr
                    key={trade.id}
                    className="border-t border-gray-100 dark:border-gray-800"
                  >
                    <td className="py-3 pr-3 text-xs text-gray-500">
                      {formatEpochUtc(trade.created_at)}
                    </td>
                    <td className="max-w-[280px] px-3 py-3 text-gray-700 dark:text-gray-300">
                      <span className="line-clamp-2">
                        {trade.title ?? trade.slug}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-700 dark:text-gray-300">
                      {trade.outcome}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {trade.price.toFixed(3)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {trade.shares.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatUsd(trade.notional)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatSignedUsd(trade.fee)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums ${pnlTextClass(trade.entry_edge)}`}
                    >
                      {formatPricePoints(trade.entry_edge)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums ${pnlTextClass(trade.markout_1s)}`}
                    >
                      {formatPricePoints(trade.markout_1s)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums ${pnlTextClass(trade.markout_10s)}`}
                    >
                      {formatPricePoints(trade.markout_10s)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums ${pnlTextClass(trade.markout_60s)}`}
                    >
                      {formatPricePoints(trade.markout_60s)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums ${pnlTextClass(trade.markout_end)}`}
                    >
                      {formatPricePoints(trade.markout_end)}
                    </td>
                    <td className="px-3 py-3">
                      <MarkoutBadge status={trade.markout_status} />
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500">
                      {trade.reason ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500">
                      {signalSummary(trade)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
          Settlements
        </h3>
        {detail.settlements.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            No settled positions yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="py-2 text-left font-medium">Time</th>
                  <th className="px-3 py-2 text-left font-medium">Market</th>
                  <th className="px-3 py-2 text-left font-medium">Outcome</th>
                  <th className="px-3 py-2 text-right font-medium">Shares</th>
                  <th className="px-3 py-2 text-right font-medium">Payout</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-right font-medium">Fees</th>
                  <th className="px-3 py-2 text-right font-medium">PnL</th>
                </tr>
              </thead>
              <tbody>
                {detail.settlements.map((settlement) => (
                  <tr
                    key={settlement.id}
                    className="border-t border-gray-100 dark:border-gray-800"
                  >
                    <td className="py-3 pr-3 text-xs text-gray-500">
                      {formatEpochUtc(settlement.created_at)}
                    </td>
                    <td className="max-w-[320px] px-3 py-3 text-gray-700 dark:text-gray-300">
                      <span className="line-clamp-2">
                        {settlement.title ?? settlement.slug}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-700 dark:text-gray-300">
                      {settlement.outcome}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {settlement.shares.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatUsd(settlement.payout)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatUsd(settlement.cost)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatSignedUsd(settlement.fees)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums ${pnlTextClass(settlement.pnl)}`}
                    >
                      {formatSignedUsd(settlement.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-gray-400">
        Paper only. Fills are simulated from the latest 1-second book snapshot;
        maker fills only occur when a new last-trade print crosses the simulated
        quote. This is not a live execution engine.
      </p>
    </div>
  );
}

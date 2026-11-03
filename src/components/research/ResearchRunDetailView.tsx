"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  formatEpochUtc,
  formatPercentPoints,
  formatPricePoints,
  formatSignedUsd,
  formatUsd,
  formatUsdCompact,
  pnlTextClass,
  shortAddress,
} from "@/lib/leaderboard-format";
import type {
  ResearchHorizonStats,
  ResearchRunDetail,
  ResearchSummary,
} from "@/server/research/types";

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "COMPLETE"
      ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
      : status === "ERROR"
        ? "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400"
        : "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style}`}
    >
      {status.toLowerCase()}
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

function HorizonTable({
  title,
  rows,
}: {
  title: string;
  rows: Record<string, ResearchHorizonStats>;
}) {
  const entries = Object.entries(rows);
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          No samples.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[760px] w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="py-2 text-left font-medium">Group</th>
                <th className="px-3 py-2 text-right font-medium">Fills</th>
                <th className="px-3 py-2 text-right font-medium">Entry</th>
                <th className="px-3 py-2 text-right font-medium">Entry +</th>
                <th className="px-3 py-2 text-right font-medium">MO +1s</th>
                <th className="px-3 py-2 text-right font-medium">MO +10s</th>
                <th className="px-3 py-2 text-right font-medium">MO +60s</th>
                <th className="px-3 py-2 text-right font-medium">MO end</th>
                <th className="px-3 py-2 text-right font-medium">End +</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, stats]) => (
                <tr
                  key={key}
                  className="border-t border-gray-100 dark:border-gray-800"
                >
                  <td className="py-3 pr-3 text-gray-700 dark:text-gray-300">
                    {key}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {stats.count.toLocaleString("en-US")}
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums ${pnlTextClass(stats.entryEdge)}`}
                  >
                    {formatPricePoints(stats.entryEdge)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                    {formatPercentPoints(stats.entryEdgePositive, 0)}
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums ${pnlTextClass(stats.markout1s)}`}
                  >
                    {formatPricePoints(stats.markout1s)}
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums ${pnlTextClass(stats.markout10s)}`}
                  >
                    {formatPricePoints(stats.markout10s)}
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums ${pnlTextClass(stats.markout60s)}`}
                  >
                    {formatPricePoints(stats.markout60s)}
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums ${pnlTextClass(stats.markoutEnd)}`}
                  >
                    {formatPricePoints(stats.markoutEnd)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                    {formatPercentPoints(stats.endPositive, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SummaryView({ summary }: { summary: ResearchSummary }) {
  const lifetime = summary.lifetime;
  const standing = summary.standing;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Fills fetched"
          value={summary.coverage.tradesFetched.toLocaleString("en-US")}
          hint={`${summary.coverage.enriched.toLocaleString("en-US")} enriched · ${summary.coverage.midCovered.toLocaleString("en-US")} with mid`}
        />
        <Metric
          label="Sample window"
          value={
            summary.coverage.sampleSpanDays == null
              ? "—"
              : `${summary.coverage.sampleSpanDays.toFixed(1)} days`
          }
          hint={`${formatEpochUtc(summary.coverage.firstTradeAt)} → ${formatEpochUtc(summary.coverage.lastTradeAt)}`}
        />
        <Metric
          label="Lifetime PnL"
          value={formatSignedUsd(lifetime?.positionPnl ?? null)}
          hint={`realized ${formatSignedUsd(lifetime?.realizedPnl ?? null)} · economic ${formatSignedUsd(lifetime?.economicPnl ?? null)}`}
          valueClass={pnlTextClass(lifetime?.positionPnl)}
        />
        <Metric
          label="All-time rank"
          value={
            standing?.rankPnl == null ? "—" : `#${standing.rankPnl}`
          }
          hint={
            standing?.rankVolume == null
              ? "standing unavailable"
              : `#${standing.rankVolume} by volume`
          }
        />
        <Metric
          label="Lifetime volume"
          value={formatUsdCompact(lifetime?.volumeUsd ?? null)}
          hint={`${lifetime?.tradeCount?.toLocaleString("en-US") ?? "—"} fills · ${lifetime?.marketsTraded?.toLocaleString("en-US") ?? "—"} markets`}
        />
        <Metric
          label="Maker rebates"
          value={formatUsd(lifetime?.makerRebate ?? null)}
          hint={`taker ${formatUsd(lifetime?.takerRebate ?? null)} · fees ${formatUsd(lifetime?.feesPaid ?? null)}`}
          valueClass={pnlTextClass(lifetime?.makerRebate)}
        />
        <Metric
          label="Two-sided markets"
          value={formatPercentPoints(summary.pair.twoSidedShare, 1)}
          hint={`${summary.pair.twoSided.toLocaleString("en-US")} / ${summary.pair.markets.toLocaleString("en-US")} markets`}
        />
        <Metric
          label="Paired cost"
          value={
            summary.pair.pairedCostWeighted == null
              ? "—"
              : summary.pair.pairedCostWeighted.toFixed(4)
          }
          hint={`median ${summary.pair.pairedCostMedian?.toFixed(4) ?? "—"} · ${formatPercentPoints(summary.pair.pairedBelowOneShare, 1)} below $1`}
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
            Inferred tags
          </h3>
          {summary.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-gray-400">ENTRY EDGE</p>
            <p className={`text-lg font-semibold ${pnlTextClass(summary.markout.overall.entryEdge)}`}>
              {formatPricePoints(summary.markout.overall.entryEdge)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">MARKOUT TO SETTLEMENT</p>
            <p className={`text-lg font-semibold ${pnlTextClass(summary.markout.overall.markoutEnd)}`}>
              {formatPricePoints(summary.markout.overall.markoutEnd)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">SETTLEMENT POSITIVE</p>
            <p className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {formatPercentPoints(summary.markout.overall.endPositive, 1)}
            </p>
          </div>
        </div>
      </div>

      <HorizonTable
        title="Markout by time window (5m)"
        rows={summary.markout.byWindow}
      />
      <HorizonTable
        title="Markout by entry price"
        rows={summary.markout.byPrice}
      />
      <HorizonTable
        title="Markout by outcome"
        rows={summary.markout.byOutcome}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
            Timing distribution
          </h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="py-2 text-left font-medium">Window</th>
                  <th className="px-3 py-2 text-right font-medium">Fills</th>
                  <th className="px-3 py-2 text-right font-medium">Volume</th>
                  <th className="px-3 py-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.timing).map(([window, row]) => (
                  <tr
                    key={window}
                    className="border-t border-gray-100 dark:border-gray-800"
                  >
                    <td className="py-2 text-gray-700 dark:text-gray-300">
                      {window}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {row.count.toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {formatUsdCompact(row.volume)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                      {formatPercentPoints(row.volumeShare, 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
            Pair cost / redemption structure
          </h3>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-gray-400">Markets</dt>
              <dd className="mt-1 font-medium">
                {summary.pair.markets.toLocaleString("en-US")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Two-sided</dt>
              <dd className="mt-1 font-medium">
                {summary.pair.twoSided.toLocaleString("en-US")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Weighted pair cost</dt>
              <dd className="mt-1 font-medium">
                {summary.pair.pairedCostWeighted?.toFixed(4) ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Below $1 share</dt>
              <dd className="mt-1 font-medium">
                {formatPercentPoints(summary.pair.pairedBelowOneShare, 1)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Locked profit est.</dt>
              <dd className="mt-1 font-medium text-success-600 dark:text-success-400">
                {formatUsd(summary.pair.lockedProfitEstimate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Imbalance &gt; 25%</dt>
              <dd className="mt-1 font-medium">
                {summary.pair.imbalanceOver25.toLocaleString("en-US")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Recent REDEEMs</dt>
              <dd className="mt-1 font-medium">
                {summary.activity.redeemCount.toLocaleString("en-US")} ·{" "}
                {formatUsdCompact(summary.activity.redeemValue)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Maker rebate share</dt>
              <dd className="mt-1 font-medium">
                {lifetime != null &&
                lifetime.economicPnl > 0 &&
                lifetime.makerRebate != null
                  ? formatPercentPoints(
                      (lifetime.makerRebate / lifetime.economicPnl) * 100,
                      1,
                    )
                  : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-gray-400">
            Pair and timing statistics are computed from the fetched TRADE rows.
            REDEEM counts cover the latest 1,000 non-trade activity rows only.
          </p>
        </section>
      </div>
    </div>
  );
}

export default function ResearchRunDetailView({
  initialDetail,
}: {
  initialDetail: ResearchRunDetail;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = detail.run;

  async function refresh() {
    try {
      const response = await fetch(
        `/api/admin/research/runs/${encodeURIComponent(run.id)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as ResearchRunDetail;
      if (response.ok && body.run) setDetail(body);
    } catch {
      // Keep the last known state.
    }
  }

  useEffect(() => {
    if (!["QUEUED", "FETCHING", "ENRICHING"].includes(run.status)) return;
    const timer = setInterval(refresh, 5_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.status, run.id]);

  async function remove() {
    if (
      !window.confirm(
        `Delete research run ${run.id} and all enriched rows?`,
      )
    ) {
      return;
    }
    setBusy("delete");
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/research/runs/${encodeURIComponent(run.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        setMessage(body.error?.message ?? "Could not delete the run.");
        return;
      }
      router.push("/admin/research");
      router.refresh();
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/research"
            className="text-sm text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400"
          >
            ← Trader research
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
              {shortAddress(run.address)}
            </h2>
            <StatusBadge status={run.status} />
            {run.truncated === 1 && (
              <span className="rounded-full bg-warning-50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                truncated
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-gray-400">
            {run.address}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Created {formatEpochUtc(run.created_at)} ·{" "}
            {run.progress_trades.toLocaleString("en-US")} fetched ·{" "}
            {run.enriched_trades.toLocaleString("en-US")} enriched
            {run.max_trades > 0
              ? ` · cap ${run.max_trades.toLocaleString("en-US")}`
              : " · all history"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={busy !== null}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Refresh
          </button>
          <Link
            href={`https://polymarket.com/profile/${run.address}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Polymarket ↗
          </Link>
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
        <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {message}
        </div>
      )}
      {run.error && (
        <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {run.error}
        </div>
      )}
      {["QUEUED", "FETCHING", "ENRICHING"].includes(run.status) && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400">
          Research is running in the background. This page refreshes every 5
          seconds. Fetching {run.progress_trades.toLocaleString("en-US")} /{" "}
          {run.total_expected?.toLocaleString("en-US") ?? "—"} trades; enriched{" "}
          {run.enriched_trades.toLocaleString("en-US")}.
        </div>
      )}

      {detail.summary ? (
        <SummaryView summary={detail.summary} />
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          Summary will appear when the run completes.
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
            Recent enriched fills
          </h3>
          <p className="text-xs text-gray-400">
            {detail.trades.length} shown (latest first)
          </p>
        </div>
        {detail.trades.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            No enriched trades yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1400px] w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="py-2 text-left font-medium">Time</th>
                  <th className="px-3 py-2 text-left font-medium">Market</th>
                  <th className="px-3 py-2 text-left font-medium">Side</th>
                  <th className="px-3 py-2 text-left font-medium">Window</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Shares</th>
                  <th className="px-3 py-2 text-right font-medium">Notional</th>
                  <th className="px-3 py-2 text-right font-medium">Entry</th>
                  <th className="px-3 py-2 text-right font-medium">MO +1s</th>
                  <th className="px-3 py-2 text-right font-medium">MO +10s</th>
                  <th className="px-3 py-2 text-right font-medium">MO +60s</th>
                  <th className="px-3 py-2 text-right font-medium">MO end</th>
                </tr>
              </thead>
              <tbody>
                {detail.trades.slice(0, 300).map((trade) => {
                  const window =
                    trade.elapsed == null
                      ? "—"
                      : trade.elapsed < 30
                        ? "0-30s"
                        : trade.elapsed < 60
                          ? "30-60s"
                          : trade.elapsed < 120
                            ? "1-2m"
                            : trade.elapsed < 180
                              ? "2-3m"
                              : trade.elapsed < 240
                                ? "3-4m"
                                : trade.elapsed < 300
                                  ? "4-5m"
                                  : "5m+";
                  return (
                    <tr
                      key={trade.id}
                      className="border-t border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-3 pr-3 text-xs text-gray-500">
                        {formatEpochUtc(trade.trade_ts)}
                      </td>
                      <td className="max-w-[260px] px-3 py-3 text-gray-700 dark:text-gray-300">
                        <span className="line-clamp-2">
                          {trade.title ?? trade.slug}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-gray-400">
                          {trade.outcome ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-700 dark:text-gray-300">
                        {trade.side ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">
                        {window}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {trade.price.toFixed(3)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {trade.size.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatUsd(trade.usdc_size)}
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

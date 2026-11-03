"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import {
  formatEpochUtc,
  shortAddress,
} from "@/lib/leaderboard-format";
import type { ResearchRunRow } from "@/server/research/types";

const DEFAULT_ADDRESS =
  "0xcd30457c790d8b35a08bcf3f894ad6bb52bc2dd0";
const ACTIVE = new Set(["QUEUED", "FETCHING", "ENRICHING"]);

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

export default function ResearchRuns({
  initialRuns,
}: {
  initialRuns: ResearchRunRow[];
}) {
  const [rows, setRows] = useState(initialRuns);
  const [address, setAddress] = useState(DEFAULT_ADDRESS);
  const [maxTrades, setMaxTrades] = useState("20000");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  async function refresh() {
    try {
      const response = await fetch("/api/admin/research/runs", {
        cache: "no-store",
      });
      const body = (await response.json()) as { runs?: ResearchRunRow[] };
      if (response.ok && body.runs) setRows(body.runs);
    } catch {
      // Keep the last known state.
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      if (rows.some((row) => ACTIVE.has(row.status))) refresh();
    }, 5_000);
    return () => clearInterval(timer);
  }, [rows]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create");
    setMessage(null);
    try {
      const response = await fetch("/api/admin/research/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          maxTrades: Number(maxTrades),
        }),
      });
      const body = (await response.json()) as {
        run?: ResearchRunRow;
        error?: { message?: string };
      };
      if (!response.ok || !body.run) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not start the research run.",
        });
        return;
      }
      setRows((current) => [body.run!, ...current]);
      setMessage({
        kind: "success",
        text: "Research run queued. The worker will fetch, enrich and summarize it.",
      });
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: ResearchRunRow) {
    if (
      !window.confirm(
        `Delete research run ${row.id}? All enriched trade rows for this run will be removed.`,
      )
    ) {
      return;
    }
    setBusy(`delete:${row.id}`);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/research/runs/${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not delete the run.",
        });
        return;
      }
      setRows((current) => current.filter((item) => item.id !== row.id));
      setMessage({ kind: "success", text: "Research run deleted." });
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
          Run a trader attribution ETL
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-gray-500 dark:text-gray-400">
          Fetches the wallet&apos;s TRADE activity page by page, joins every
          fill to the local 1-second book, and computes entry edge plus
          1s/10s/60s/settlement markouts, timing, price buckets, pair-cost and
          two-sided structure. The worker runs in the background.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Label htmlFor="research-address">Wallet address</Label>
            <Input
              id="research-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="0x…"
            />
          </div>
          <div>
            <Label htmlFor="research-max">Max trades (0 = all)</Label>
            <Input
              id="research-max"
              type="number"
              value={maxTrades}
              onChange={(event) => setMaxTrades(event.target.value)}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          0 means “fetch until the API cursor is exhausted”. The target wallet
          has ~576k lifetime fills; a full run can take minutes and store a
          large table. 20,000 is a practical first pass.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy !== null}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy === "create" ? "Queuing…" : "Start research run"}
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={busy !== null}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Refresh
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
            No research runs yet.
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Start with the tracked address above to build the attribution
            dataset and markout profile.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <table className="min-w-[1000px] w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Run</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Fetched</th>
                <th className="px-4 py-3 text-right font-medium">Enriched</th>
                <th className="px-4 py-3 text-right font-medium">Expected</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-left font-medium">Error</th>
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
                      href={`/admin/research/${row.id}`}
                      className="font-mono text-xs text-gray-700 hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-400"
                    >
                      {row.id}
                    </Link>
                    <p className="mt-1 text-xs text-gray-400">
                      {shortAddress(row.address)} · max{" "}
                      {row.max_trades === 0 ? "all" : row.max_trades.toLocaleString("en-US")}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={row.status} />
                    {row.truncated === 1 && (
                      <p className="mt-1 text-[10px] text-warning-600 dark:text-warning-400">
                        truncated at cap
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {row.progress_trades.toLocaleString("en-US")}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {row.enriched_trades.toLocaleString("en-US")}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums text-gray-500">
                    {row.total_expected == null
                      ? "—"
                      : row.total_expected.toLocaleString("en-US")}
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-500">
                    {formatEpochUtc(row.created_at)}
                  </td>
                  <td className="max-w-[220px] px-4 py-4 text-xs text-error-600 dark:text-error-400">
                    {row.error ? (
                      <span className="line-clamp-3">{row.error}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/admin/research/${row.id}`}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(row)}
                        disabled={busy !== null}
                        className="rounded-md border border-error-300 px-3 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:border-error-500/40 dark:text-error-400 dark:hover:bg-error-500/10"
                      >
                        {busy === `delete:${row.id}` ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import type { LeaderboardEntry } from "@/server/leaderboard/types";
import {
  formatAge,
  formatEpochUtc,
  formatPercentPoints,
  formatSignedUsd,
  formatUsdCompact,
  pnlTextClass,
  shortAddress,
} from "@/lib/leaderboard-format";

interface SyncResultView {
  ok: boolean;
  error?: string;
  warning?: string;
}

interface ErrorBody {
  error?: { message?: string };
}

interface AddResponse extends ErrorBody {
  user?: LeaderboardEntry;
  sync?: SyncResultView;
}

interface SyncResponse extends ErrorBody {
  user?: LeaderboardEntry;
  sync?: SyncResultView;
  summary?: { synced: number; failed: number; skipped: number };
  users?: LeaderboardEntry[];
}

function StatusBadge({ entry }: { entry: LeaderboardEntry }) {
  const style =
    entry.syncStatus === "ok"
      ? entry.lastSyncWarning
        ? "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400"
        : "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
      : entry.syncStatus === "syncing"
        ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
        : entry.syncStatus === "error"
          ? "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400"
          : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";
  const label =
    entry.syncStatus === "ok"
      ? entry.lastSyncWarning
        ? "partial"
        : "synced"
      : entry.syncStatus;

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style}`}
    >
      {label}
    </span>
  );
}

function Avatar({ entry }: { entry: LeaderboardEntry }) {
  if (entry.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={entry.image}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-9 w-9 shrink-0 rounded-full bg-gray-100 object-cover dark:bg-white/10"
      />
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
      {entry.displayName.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function LeaderboardAddresses({
  initialUsers,
  syncMinutes,
}: {
  initialUsers: LeaderboardEntry[];
  syncMinutes: number;
}) {
  const [rows, setRows] = useState(initialUsers);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editNotes, setEditNotes] = useState("");

  function replaceRow(entry: LeaderboardEntry) {
    setRows((current) =>
      current.map((row) => (row.id === entry.id ? entry : row)),
    );
  }

  async function addTrader(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address.trim()) {
      setMessage({ kind: "error", text: "Enter a wallet address." });
      return;
    }

    setBusy("add");
    setMessage(null);
    try {
      const response = await fetch("/api/admin/leaderboard/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          label: label.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const body = (await response.json()) as AddResponse;
      const added = body.user;
      if (!response.ok || !added) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not add the address.",
        });
        return;
      }

      setRows((current) => [
        added,
        ...current.filter((row) => row.id !== added.id),
      ]);
      setAddress("");
      setLabel("");
      setNotes("");

      if (body.sync && !body.sync.ok) {
        setMessage({
          kind: "error",
          text: `Address saved, but the first sync failed: ${body.sync.error ?? "unknown error"}`,
        });
      } else if (body.sync?.warning) {
        setMessage({
          kind: "success",
          text: `Address added. Partial sync: ${body.sync.warning}`,
        });
      } else {
        setMessage({ kind: "success", text: "Address added and synced." });
      }
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function syncRow(row: LeaderboardEntry) {
    setBusy(`sync:${row.id}`);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/leaderboard/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      const body = (await response.json()) as SyncResponse;
      if (body.user) replaceRow(body.user);
      if (!response.ok) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not sync the trader.",
        });
      } else if (body.sync && !body.sync.ok) {
        setMessage({
          kind: "error",
          text: `Sync failed: ${body.sync.error ?? "unknown error"}`,
        });
      } else if (body.sync?.warning) {
        setMessage({
          kind: "success",
          text: `Synced with a warning: ${body.sync.warning}`,
        });
      } else {
        setMessage({ kind: "success", text: "Trader synced." });
      }
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function syncAll() {
    setBusy("sync-all");
    setMessage(null);
    try {
      const response = await fetch("/api/admin/leaderboard/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const body = (await response.json()) as SyncResponse;
      if (body.users) setRows(body.users);
      if (!response.ok || !body.summary) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not sync the leaderboard.",
        });
        return;
      }
      setMessage({
        kind: body.summary.failed > 0 ? "error" : "success",
        text: `Sync finished: ${body.summary.synced} ok, ${body.summary.failed} failed, ${body.summary.skipped} skipped.`,
      });
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(row: LeaderboardEntry) {
    setBusy(`active:${row.id}`);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/leaderboard/users/${encodeURIComponent(row.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !row.active }),
        },
      );
      const body = (await response.json()) as SyncResponse;
      if (!response.ok || !body.user) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not update the trader.",
        });
        return;
      }
      replaceRow(body.user);
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  function startEdit(row: LeaderboardEntry) {
    setEditingId(row.id);
    setEditLabel(row.label ?? "");
    setEditNotes(row.notes ?? "");
  }

  async function saveEdit(row: LeaderboardEntry) {
    setBusy(`edit:${row.id}`);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/leaderboard/users/${encodeURIComponent(row.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: editLabel, notes: editNotes }),
        },
      );
      const body = (await response.json()) as SyncResponse;
      if (!response.ok || !body.user) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not update the trader.",
        });
        return;
      }
      replaceRow(body.user);
      setEditingId(null);
      setMessage({ kind: "success", text: "Trader updated." });
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: LeaderboardEntry) {
    const confirmed = window.confirm(
      `Remove ${row.displayName} (${shortAddress(row.address)}) from the leaderboard? All cached data for this address will be deleted.`,
    );
    if (!confirmed) return;

    setBusy(`delete:${row.id}`);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/leaderboard/users/${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as ErrorBody;
      if (!response.ok) {
        setMessage({
          kind: "error",
          text: body.error?.message ?? "Could not delete the trader.",
        });
        return;
      }
      setRows((current) => current.filter((item) => item.id !== row.id));
      setMessage({ kind: "success", text: "Trader removed." });
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={addTrader}
        className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
          Add a trader
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Paste a Polymarket proxy wallet address collected from the public
          leaderboard or profile page. The address is synced immediately.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="trader-address">Wallet address</Label>
            <Input
              id="trader-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="0x… or https://polymarket.com/profile/0x…"
            />
          </div>
          <div>
            <Label htmlFor="trader-label">Label (optional, public)</Label>
            <Input
              id="trader-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Whale #1, Sports specialist"
            />
          </div>
          <div className="lg:col-span-2">
            <Label htmlFor="trader-notes">Private notes (optional)</Label>
            <textarea
              id="trader-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90 dark:placeholder:text-white/30"
              placeholder="Why this address is tracked, source link, etc. Notes are admin-only."
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy !== null}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy === "add" ? "Adding and syncing…" : "Add and sync"}
          </button>
          <span className="text-xs text-gray-400">
            Only public Polymarket data is read. No wallet signing or API keys
            are required.
          </span>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {rows.length} address{rows.length === 1 ? "" : "es"} ·{" "}
          {rows.filter((row) => row.active).length} visible on the public
          leaderboard
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/leaderboard"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            View public leaderboard
          </Link>
          <button
            type="button"
            onClick={syncAll}
            disabled={busy !== null || rows.length === 0}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy === "sync-all" ? "Syncing all…" : "Sync all"}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center dark:border-gray-700">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            No addresses yet.
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Add a manually collected Polymarket wallet above to start building
            the leaderboard.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Trader</th>
                <th className="px-4 py-3 text-left font-medium">Label / notes</th>
                <th className="px-4 py-3 text-left font-medium">Sync</th>
                <th className="px-4 py-3 text-right font-medium">PnL</th>
                <th className="px-4 py-3 text-right font-medium">Volume</th>
                <th className="px-4 py-3 text-right font-medium">Win rate</th>
                <th className="px-4 py-3 text-center font-medium">Public</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const editing = editingId === row.id;
                return (
                  <tr
                    key={row.id}
                    className="border-t border-gray-100 align-top dark:border-gray-800"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <Avatar entry={row} />
                        <div className="min-w-0">
                          <Link
                            href={`/leaderboard/${row.address}`}
                            className="block truncate font-medium text-gray-800 hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-400"
                          >
                            {row.displayName}
                          </Link>
                          <p className="mt-0.5 font-mono text-xs text-gray-400">
                            {shortAddress(row.address)}
                          </p>
                          {row.pseudonym && (
                            <p className="mt-0.5 truncate text-xs text-gray-400">
                              @{row.pseudonym}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[260px] px-4 py-4">
                      {editing ? (
                        <div className="space-y-2">
                          <Input
                            value={editLabel}
                            onChange={(event) => setEditLabel(event.target.value)}
                            placeholder="Label"
                          />
                          <textarea
                            value={editNotes}
                            onChange={(event) => setEditNotes(event.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-xs text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
                            placeholder="Private notes"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveEdit(row)}
                              disabled={busy !== null}
                              className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                            >
                              {busy === `edit:${row.id}` ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              disabled={busy !== null}
                              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {row.label || (
                              <span className="text-gray-400">No label</span>
                            )}
                          </p>
                          {row.notes && (
                            <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                              {row.notes}
                            </p>
                          )}
                          {row.lastSyncError && (
                            <p className="mt-1 line-clamp-2 text-xs text-error-600 dark:text-error-400">
                              {row.lastSyncError}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge entry={row} />
                      <p
                        className="mt-1 text-xs text-gray-400"
                        suppressHydrationWarning
                      >
                        {formatAge(row.lastSyncedAt)}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {formatEpochUtc(row.lastSyncedAt)}
                      </p>
                      {row.lastSyncWarning && (
                        <p className="mt-1 line-clamp-2 max-w-[180px] text-[10px] text-warning-600 dark:text-warning-400">
                          {row.lastSyncWarning}
                        </p>
                      )}
                    </td>
                    <td
                      className={`px-4 py-4 text-right font-medium tabular-nums ${pnlTextClass(
                        row.metrics?.lifetime?.positionPnl ??
                          row.metrics?.totalPnl,
                      )}`}
                    >
                      {formatSignedUsd(
                        row.metrics?.lifetime?.positionPnl ??
                          row.metrics?.totalPnl,
                      )}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {formatUsdCompact(
                        row.metrics?.lifetime?.volumeUsd ??
                          row.metrics?.volume,
                      )}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {formatPercentPoints(row.metrics?.winRate)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => toggleActive(row)}
                        disabled={busy !== null}
                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide disabled:opacity-50 ${
                          row.active
                            ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                            : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                        }`}
                        title={
                          row.active
                            ? "Click to hide from the public leaderboard"
                            : "Click to show on the public leaderboard"
                        }
                      >
                        {busy === `active:${row.id}`
                          ? "…"
                          : row.active
                            ? "Visible"
                            : "Hidden"}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => syncRow(row)}
                          disabled={busy !== null}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                        >
                          {busy === `sync:${row.id}` ? "Syncing…" : "Sync"}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          disabled={busy !== null || editing}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(row)}
                          disabled={busy !== null}
                          className="rounded-md border border-error-300 px-3 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:border-error-500/40 dark:text-error-400 dark:hover:bg-error-500/10"
                        >
                          {busy === `delete:${row.id}` ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        <p className="font-medium text-gray-700 dark:text-gray-300">
          How syncing works
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Each sync fetches the public profile, current positions, closed
            positions, recent activity and portfolio value from Polymarket.
          </li>
          <li>
            The background worker refreshes active addresses every{" "}
            {syncMinutes} minutes. Hidden addresses are skipped until shown
            again.
          </li>
          <li>
            Data is cached in the business SQLite database; removing an address
            deletes its cached positions, trades and profile.
          </li>
        </ul>
      </div>
    </div>
  );
}

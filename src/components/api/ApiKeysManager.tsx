"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import type { ApiKeyPublic } from "@/server/api-keys";

function formatUtc(epoch: number | null): string {
  if (epoch == null) return "Never";
  return (
    new Date(epoch * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC"
  );
}

export default function ApiKeysManager({
  initialKeys,
  limit,
  ratePerMinute,
  requestsPerDay,
}: {
  initialKeys: ApiKeyPublic[];
  limit: number;
  ratePerMinute: number;
  requestsPerDay: number;
}) {
  const router = useRouter();
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const activeCount = keys.filter((key) => key.revoked_at == null).length;

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNewToken(null);
    setLoading(true);
    try {
      const response = await fetch("/api/account/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await response.json()) as {
        key?: ApiKeyPublic;
        token?: string;
        error?: { message?: string };
      };
      if (!response.ok || !body.key || !body.token) {
        setError(body.error?.message ?? "Could not create the API key.");
        return;
      }
      setKeys((current) => [body.key!, ...current]);
      setNewToken(body.token);
      setName("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function revokeKey(id: string) {
    if (!window.confirm("Revoke this API key? Existing clients will stop working.")) {
      return;
    }
    setError(null);
    setRevoking(id);
    try {
      const response = await fetch(
        `/api/account/api-keys/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(body.error?.message ?? "Could not revoke the API key.");
        return;
      }
      setKeys((current) =>
        current.map((key) =>
          key.id === id
            ? { ...key, revoked_at: Math.floor(Date.now() / 1000) }
            : key,
        ),
      );
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setRevoking(null);
    }
  }

  async function copyToken() {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
    } catch {
      // The token remains visible for manual copy.
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {newToken && (
        <div className="rounded-2xl border border-success-200 bg-success-50 p-5 dark:border-success-500/30 dark:bg-success-500/10">
          <p className="text-sm font-medium text-success-700 dark:text-success-400">
            API key created. Copy it now — it will not be shown again.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-white px-3 py-2 text-xs text-gray-800 dark:bg-zinc-900 dark:text-gray-200">
              {newToken}
            </code>
            <button
              type="button"
              onClick={copyToken}
              className="rounded-lg border border-success-300 px-3 py-2 text-xs font-medium text-success-700 hover:bg-success-100 dark:border-success-500/40 dark:text-success-400"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
              Create key
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {activeCount}/{limit} active keys · {ratePerMinute} requests/min ·{" "}
              {requestsPerDay.toLocaleString("en-US")} requests/day
            </p>
          </div>
        </div>
        <form onSubmit={createKey} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Key name (e.g. research notebook)"
            className="h-11 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
            disabled={loading || limit <= 0 || activeCount >= limit}
          />
          <button
            type="submit"
            disabled={loading || limit <= 0 || activeCount >= limit}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create API key"}
          </button>
        </form>
        {limit > 0 && activeCount >= limit && (
          <p className="mt-2 text-xs text-warning-600 dark:text-warning-400">
            Key limit reached for your plan.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
            Your keys
          </h2>
        </div>
        {keys.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500 dark:text-gray-400">
            No API keys yet.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {keys.map((key) => {
              const revoked = key.revoked_at != null;
              return (
                <div
                  key={key.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {key.name}
                    </p>
                    <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {key.prefix}…
                    </p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      Created {formatUtc(key.created_at)} · Last used{" "}
                      {formatUtc(key.last_used_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
                        revoked
                          ? "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400"
                          : "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                      }`}
                    >
                      {revoked ? "Revoked" : "Active"}
                    </span>
                    {!revoked && (
                      <button
                        type="button"
                        onClick={() => revokeKey(key.id)}
                        disabled={revoking === key.id}
                        className="rounded-lg border border-error-300 px-3 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:border-error-500/40 dark:text-error-400 dark:hover:bg-error-500/10"
                      >
                        {revoking === key.id ? "Revoking..." : "Revoke"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

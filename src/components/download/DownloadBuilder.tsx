"use client";

import { useEffect, useState } from "react";

import type { Entitlements } from "@/server/entitlements";
import type { ExportJobRow } from "@/server/export/jobs";
import type {
  ExportDataset,
  ExportFormat,
  ExportInterval,
} from "@/server/export/csv";
import type { Usage } from "@/server/usage";
import type { Period } from "@/lib/types";

interface AssetOption {
  asset: string;
  label: string;
}

interface EstimateResponse {
  estimate: { markets: number; rows: number; bytes: number };
  remainingBytes: number;
  earliestDay: string;
  canDirect: boolean;
  maxDirectRows: number;
  maxDirectBytes: number;
  error?: { code?: string; message?: string };
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatUtc(epoch: number | null): string {
  if (epoch == null) return "—";
  return (
    new Date(epoch * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC"
  );
}

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
  running: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400",
  done: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400",
  failed: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400",
  expired: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
};

export default function DownloadBuilder({
  assets,
  periods,
  entitlements,
  usage,
  initialJobs,
  defaultFrom,
  defaultTo,
  earliestDay,
}: {
  assets: AssetOption[];
  periods: Period[];
  entitlements: Entitlements;
  usage: Usage;
  initialJobs: ExportJobRow[];
  defaultFrom: string;
  defaultTo: string;
  earliestDay: string;
}) {
  const [asset, setAsset] = useState(assets[0]?.asset ?? "btc");
  const [period, setPeriod] = useState<Period>(periods[0] ?? "5m");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [dataset, setDataset] = useState<ExportDataset>("samples");
  const [resolvedOnly, setResolvedOnly] = useState(false);
  const [interval, setIntervalValue] = useState<ExportInterval>("raw");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [jobs, setJobs] = useState(initialJobs);
  const [creating, setCreating] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);

  const query = {
    asset,
    period,
    from,
    to,
    dataset,
    resolved: resolvedOnly ? "1" : "0",
    interval: dataset === "markets" ? "raw" : interval,
  };

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ ...query, format: "csv" });
      fetch(`/api/download/estimate?${params.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const body = (await response.json()) as EstimateResponse;
          if (!response.ok) {
            setEstimate(null);
            setEstimateError(body.error?.message ?? "Could not estimate export.");
            return;
          }
          setEstimate(body);
          setEstimateError(null);
        })
        .catch((error: Error) => {
          if (error.name !== "AbortError") {
            setEstimateError("Could not estimate export.");
          }
        });
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // The object is rebuilt from the individual fields below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, period, from, to, dataset, resolvedOnly, interval]);

  useEffect(() => {
    if (!jobs.some((job) => job.status === "queued" || job.status === "running")) {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const response = await fetch("/api/downloads", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { jobs?: ExportJobRow[] };
        if (body.jobs) setJobs(body.jobs);
      } catch {
        // Keep polling; transient network errors are expected.
      }
    }, 3_000);
    return () => clearInterval(timer);
  }, [jobs]);

  async function createJob() {
    setJobError(null);
    setCreating(true);
    try {
      const response = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...query,
          resolvedOnly,
          format,
        }),
      });
      const body = (await response.json()) as {
        job?: ExportJobRow;
        error?: { message?: string };
      };
      if (!response.ok || !body.job) {
        setJobError(body.error?.message ?? "Could not create the export.");
        return;
      }
      setJobs((current) => [body.job!, ...current]);
    } catch {
      setJobError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  const directParams = new URLSearchParams({ ...query, format: "csv" });
  const directHref = `/api/download?${directParams.toString()}`;
  const canDirect = estimate?.canDirect ?? false;
  const quotaRemaining =
    estimate?.remainingBytes ??
    Math.max(0, entitlements.exportBytesPerDay - usage.exportBytes);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs text-gray-500 dark:text-gray-400">
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

          <label className="text-xs text-gray-500 dark:text-gray-400">
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

          <label className="text-xs text-gray-500 dark:text-gray-400">
            From (UTC)
            <input
              type="date"
              value={from}
              min={earliestDay}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
            />
          </label>

          <label className="text-xs text-gray-500 dark:text-gray-400">
            To (UTC)
            <input
              type="date"
              value={to}
              min={from}
              max={defaultTo}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
            />
          </label>

          <label className="text-xs text-gray-500 dark:text-gray-400">
            Dataset
            <select
              value={dataset}
              onChange={(event) =>
                setDataset(event.target.value as ExportDataset)
              }
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
            >
              <option value="samples">Samples</option>
              <option value="markets">Market metadata</option>
            </select>
          </label>

          <label className="text-xs text-gray-500 dark:text-gray-400">
            Sample interval
            <select
              value={interval}
              disabled={dataset === "markets"}
              onChange={(event) =>
                setIntervalValue(event.target.value as ExportInterval)
              }
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 disabled:opacity-50 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
            >
              <option value="raw">Raw</option>
              <option value="5s">5 seconds</option>
              <option value="1m">1 minute</option>
              <option value="5m">5 minutes</option>
            </select>
          </label>

          <label className="text-xs text-gray-500 dark:text-gray-400">
            Background format
            <select
              value={format}
              onChange={(event) => setFormat(event.target.value as ExportFormat)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
            >
              <option value="csv">CSV</option>
              <option value="csv.gz">CSV.gz</option>
            </select>
          </label>

          <label className="flex items-end gap-2 pb-2 text-xs text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={resolvedOnly}
              onChange={(event) => setResolvedOnly(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-600"
            />
            Resolved markets only
          </label>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.02]">
            <p className="text-xs text-gray-500 dark:text-gray-400">Estimated rows</p>
            <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
              {estimate ? formatNumber(estimate.estimate.rows) : "—"}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              {estimate
                ? `${formatNumber(estimate.estimate.markets)} markets`
                : "Calculating…"}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.02]">
            <p className="text-xs text-gray-500 dark:text-gray-400">Estimated size</p>
            <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
              {estimate ? formatBytes(estimate.estimate.bytes) : "—"}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              Direct limit {formatBytes(estimate?.maxDirectBytes ?? 0)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.02]">
            <p className="text-xs text-gray-500 dark:text-gray-400">Daily quota left</p>
            <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
              {formatBytes(quotaRemaining)}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              Plan limit {formatBytes(entitlements.exportBytesPerDay)} / day
            </p>
          </div>
        </div>

        {estimateError && (
          <p className="mt-4 text-sm text-error-600 dark:text-error-400">
            {estimateError}
          </p>
        )}
        {jobError && (
          <p className="mt-4 text-sm text-error-600 dark:text-error-400">
            {jobError}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {canDirect ? (
            <a
              href={directHref}
              className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
            >
              Download CSV
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500 dark:bg-white/10 dark:text-gray-400"
            >
              Direct download unavailable
            </button>
          )}
          <button
            type="button"
            onClick={createJob}
            disabled={creating}
            className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            {creating ? "Creating…" : "Create background export"}
          </button>
          {estimate && !canDirect && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Large selections must run in the background.
            </span>
          )}
        </div>
        <p className="mt-3 text-[11px] text-gray-400">
          Direct downloads are always CSV; gzip is only used for background
          exports. The sample interval option keeps the last observation in each
          bucket.
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
              Export jobs
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Files are retained for {entitlements.exportRetentionDays} days.
            </p>
          </div>
          <span className="text-xs text-gray-400">
            {jobs.filter((job) => job.status === "running").length > 0
              ? "Processing…"
              : `${jobs.length} job(s)`}
          </span>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No export jobs yet.
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <article
                key={job.id}
                className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {job.id}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Created {formatUtc(job.created_at)} ·{" "}
                      {job.rows != null ? `${formatNumber(job.rows)} rows · ` : ""}
                      {job.bytes != null ? formatBytes(job.bytes) : "—"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
                      STATUS_STYLES[job.status] ?? STATUS_STYLES.queued
                    }`}
                  >
                    {job.status}
                  </span>
                </div>

                {(job.status === "running" || job.status === "queued") && (
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-all"
                        style={{
                          width: `${Math.max(
                            job.status === "queued" ? 2 : 5,
                            Math.round((job.progress ?? 0) * 100),
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {job.status === "queued"
                        ? "Waiting for the export worker."
                        : `${formatNumber(job.processed_rows ?? 0)} rows processed`}
                    </p>
                  </div>
                )}

                {job.error && (
                  <p className="mt-2 text-xs text-error-600 dark:text-error-400">
                    {job.error}
                  </p>
                )}
                {job.expires_at != null && (
                  <p className="mt-2 text-[11px] text-gray-400">
                    File expires {formatUtc(job.expires_at)}
                  </p>
                )}
                {job.status === "done" && (
                  <a
                    href={`/api/downloads/${encodeURIComponent(job.id)}/file`}
                    className="mt-3 inline-flex rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
                  >
                    Download file
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

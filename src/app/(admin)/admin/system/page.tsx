import type { Metadata } from "next";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { requireAdmin } from "@/server/auth";
import { getSystemStatus } from "@/server/monitoring";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "System status | PolyKlines Admin",
  description: "Collector, jobs, queues, disk and database status.",
};

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

function formatAge(seconds: number | null): string {
  if (seconds == null) return "never";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function statusStyle(status: string): string {
  if (status === "ok") {
    return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  }
  if (status === "critical") {
    return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  }
  return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
}

export default async function AdminSystemPage() {
  await requireAdmin();
  const status = getSystemStatus();
  const diskUsed = status.disk.totalBytes - status.disk.freeBytes;
  const exportQueue = status.queues.exports;
  const backtestQueue = status.queues.backtests;

  return (
    <div>
      <PageBreadcrumb pageTitle="System status" />
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <span className={`rounded-full px-3 py-1 text-xs font-medium uppercase ${statusStyle(status.status)}`}>
          {status.status}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Checked {new Date(status.now * 1000).toISOString()}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">Collector heartbeat</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {formatAge(status.collectorHeartbeatAge)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {status.collector?.ws_connections ?? 0} WS ·{" "}
            {status.collector?.active_markets ?? 0} active markets
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">Jobs worker heartbeat</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {formatAge(status.jobsHeartbeatAge)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            pid {status.jobs?.pid ?? "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">Queues</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {exportQueue.queued ?? 0} export · {backtestQueue.queued ?? 0} backtest
          </p>
          <p className="mt-1 text-xs text-gray-400">
            running {exportQueue.running ?? 0} / {backtestQueue.running ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">Disk free</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {formatBytes(status.disk.freeBytes)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {status.disk.usedPercent.toFixed(1)}% used of{" "}
            {formatBytes(status.disk.totalBytes)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
            Storage
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Market DB</dt>
              <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                {formatBytes(status.database.marketBytes)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Market WAL</dt>
              <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                {formatBytes(status.database.marketWalBytes)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">App DB</dt>
              <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                {formatBytes(status.database.appBytes)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">App WAL</dt>
              <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                {formatBytes(status.database.appWalBytes)}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-gray-500 dark:text-gray-400">Disk used</dt>
              <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
                {formatBytes(diskUsed)} of {formatBytes(status.disk.totalBytes)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-gray-400">
            Market DB path: {process.env.POLY_DB_PATH ?? "default"}
          </p>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
            Recent failures
          </h2>
          {status.recentFailures.exports.length === 0 &&
          status.recentFailures.backtests.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              No failed export or backtest jobs.
            </p>
          ) : (
            <div className="mt-4 space-y-3 text-xs">
              {[...status.recentFailures.exports, ...status.recentFailures.backtests].map(
                (failure) => (
                  <div key={failure.id}>
                    <p className="font-mono text-gray-700 dark:text-gray-300">
                      {failure.id}
                    </p>
                    <p className="mt-1 break-words text-error-600 dark:text-error-400">
                      {failure.error ?? "Unknown error"}
                    </p>
                  </div>
                ),
              )}
            </div>
          )}
          <p className="mt-4 text-xs text-gray-400">
            Last jobs error: {status.jobs?.lastError ?? "none"}
          </p>
        </section>
      </div>
    </div>
  );
}

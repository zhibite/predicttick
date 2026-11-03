import type { Metadata } from "next";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { requireUser } from "@/server/auth";
import { getEntitlements } from "@/server/entitlements";
import { getUsage } from "@/server/usage";
import {
  getApiKeyUsageHistory,
  getUsageHistory,
} from "@/server/usage-history";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Usage | PolyKlines",
  description: "API, export and backtest usage for your PolyKlines account.",
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export default async function UsagePage() {
  const user = await requireUser();
  const entitlements = getEntitlements(user);
  const today = getUsage(user.id);
  const history = getUsageHistory(user.id);
  const keyUsage = getApiKeyUsageHistory(user.id);

  return (
    <div>
      <PageBreadcrumb pageTitle="Usage" />
      <p className="mb-6 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        Daily usage is counted in UTC. API requests are counted per authenticated
        request; exports count bytes written; backtests count runs and processed
        windows.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">API requests today</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {formatNumber(today.apiRequests)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            limit {formatNumber(entitlements.apiRequestsPerDay)} / day
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">Export bytes today</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {formatBytes(today.exportBytes)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            limit {formatBytes(entitlements.exportBytesPerDay)} / day
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">Backtests today</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {formatNumber(today.backtestRuns)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            limit {formatNumber(entitlements.backtestRunsPerDay)} / day
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">Windows processed today</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {formatNumber(today.backtestWindows)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            per-run cap {formatNumber(entitlements.backtestMaxWindows)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
              Daily usage
            </h2>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="sticky top-0 bg-gray-50 text-gray-500 dark:bg-zinc-800 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2">Day</th>
                  <th className="px-4 py-2">API</th>
                  <th className="px-4 py-2">Export</th>
                  <th className="px-4 py-2">Backtests</th>
                  <th className="px-4 py-2">Windows</th>
                </tr>
              </thead>
              <tbody className="text-gray-700 dark:text-gray-300">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-gray-500 dark:text-gray-400">
                      No usage recorded yet.
                    </td>
                  </tr>
                ) : (
                  history.map((day) => (
                    <tr key={day.day} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-2">{day.day}</td>
                      <td className="px-4 py-2">{formatNumber(day.apiRequests)}</td>
                      <td className="px-4 py-2">{formatBytes(day.exportBytes)}</td>
                      <td className="px-4 py-2">{formatNumber(day.backtestRuns)}</td>
                      <td className="px-4 py-2">{formatNumber(day.backtestWindows)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
              API key usage
            </h2>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="sticky top-0 bg-gray-50 text-gray-500 dark:bg-zinc-800 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2">Key</th>
                  <th className="px-4 py-2">Day</th>
                  <th className="px-4 py-2">Requests</th>
                  <th className="px-4 py-2">Bytes</th>
                </tr>
              </thead>
              <tbody className="text-gray-700 dark:text-gray-300">
                {keyUsage.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-gray-500 dark:text-gray-400">
                      No API key usage recorded yet.
                    </td>
                  </tr>
                ) : (
                  keyUsage.map((row) => (
                    <tr
                      key={`${row.keyId}:${row.day}`}
                      className="border-t border-gray-100 dark:border-gray-800"
                    >
                      <td className="px-4 py-2">
                        {row.name}
                        <span className="ml-1 font-mono text-[11px] text-gray-400">
                          {row.prefix}…
                        </span>
                      </td>
                      <td className="px-4 py-2">{row.day}</td>
                      <td className="px-4 py-2">{formatNumber(row.requests)}</td>
                      <td className="px-4 py-2">{formatBytes(row.bytes)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

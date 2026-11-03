import type { CurrentUser } from "@/server/user-types";
import {
  canDownload,
  getEntitlements,
  type Entitlements,
} from "@/server/entitlements";
import { currentUtcDay, getUsage, type Usage } from "@/server/usage";

import { dateToEpoch, estimateExport, type ExportEstimate, type ExportFilters } from "./csv";

export interface DownloadLimits {
  entitlements: Entitlements;
  usage: Usage;
  estimate: ExportEstimate;
  remainingBytes: number;
  earliestDay: string;
}

export interface DownloadGuardError {
  code: string;
  message: string;
  status: number;
}

export interface DownloadGuardResult {
  error?: DownloadGuardError;
  limits?: DownloadLimits;
}

export function evaluateDownload(
  user: CurrentUser,
  filters: ExportFilters,
): DownloadGuardResult {
  if (!canDownload(user)) {
    return {
      error: {
        code: "PAYMENT_REQUIRED",
        message: "An active access pass is required to download data.",
        status: 402,
      },
    };
  }

  const entitlements = getEntitlements(user);
  if (entitlements.exportBytesPerDay <= 0) {
    return {
      error: {
        code: "PAYMENT_REQUIRED",
        message: "CSV exports are not included in this plan.",
        status: 402,
      },
    };
  }

  const today = currentUtcDay();
  if (filters.to > today) {
    return {
      error: {
        code: "FUTURE_DATE",
        message: "The end date cannot be in the future.",
        status: 400,
      },
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const earliestEpoch = now - entitlements.historyDays * 86_400;
  const earliestDay = new Date(earliestEpoch * 1000).toISOString().slice(0, 10);
  if (dateToEpoch(filters.from) < earliestEpoch) {
    return {
      error: {
        code: "HISTORY_LIMIT",
        message: `Your plan can export data from ${earliestDay} onward.`,
        status: 403,
      },
    };
  }

  const estimate = estimateExport(filters);
  if (estimate.markets === 0 && estimate.rows === 0) {
    return {
      error: {
        code: "NO_COVERAGE",
        message:
          "No data coverage for this range. The coverage rollup may need to be backfilled.",
        status: 404,
      },
    };
  }

  const usage = getUsage(user.id);
  const remainingBytes = Math.max(
    0,
    entitlements.exportBytesPerDay - usage.exportBytes,
  );

  if (estimate.bytes > remainingBytes) {
    return {
      error: {
        code: "EXPORT_QUOTA_EXCEEDED",
        message: "This export would exceed today's export quota.",
        status: 429,
      },
    };
  }

  return {
    limits: {
      entitlements,
      usage,
      estimate,
      remainingBytes,
      earliestDay,
    },
  };
}

export const MAX_DIRECT_ROWS = 2_000_000;
export const MAX_DIRECT_BYTES = 300 * 1024 * 1024;

export function canStreamDirect(estimate: ExportEstimate): boolean {
  return (
    estimate.rows <= MAX_DIRECT_ROWS && estimate.bytes <= MAX_DIRECT_BYTES
  );
}

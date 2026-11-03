import type { CurrentUser } from "./auth";
import { getPlan, parseFeatures } from "./billing";

export interface Entitlements {
  historyDays: number;
  exportBytesPerDay: number;
  exportRetentionDays: number;
  apiKeys: number;
  apiRequestsPerDay: number;
  apiRatePerMinute: number;
  backtestRunsPerDay: number;
  backtestMaxDays: number;
  backtestMaxWindows: number;
  backtestConcurrency: number;
  savedStrategies: number;
  resultRetentionDays: number;
  backtestTrialRuns: number;
}

const ADMIN: Entitlements = {
  historyDays: 730,
  exportBytesPerDay: 50 * 1024 * 1024 * 1024,
  exportRetentionDays: 30,
  apiKeys: 5,
  apiRequestsPerDay: 100_000,
  apiRatePerMinute: 300,
  backtestRunsPerDay: 500,
  backtestMaxDays: 730,
  backtestMaxWindows: 2_000_000,
  backtestConcurrency: 2,
  savedStrategies: 500,
  resultRetentionDays: 180,
  backtestTrialRuns: 0,
};

const FREE: Entitlements = {
  historyDays: 30,
  exportBytesPerDay: 0,
  exportRetentionDays: 0,
  apiKeys: 0,
  apiRequestsPerDay: 0,
  apiRatePerMinute: 0,
  backtestRunsPerDay: 0,
  backtestMaxDays: 7,
  backtestMaxWindows: 50_000,
  backtestConcurrency: 1,
  savedStrategies: 0,
  resultRetentionDays: 7,
  backtestTrialRuns: 3,
};

export function getEntitlements(user: CurrentUser): Entitlements {
  if (user.role === "admin") return ADMIN;
  if (!user.access.isPaid || !user.access.planCode) return FREE;

  const plan = getPlan(user.access.planCode);
  if (!plan) return FREE;
  const features = parseFeatures(plan.features_json);
  const isPro = plan.code.startsWith("pro");
  return {
    historyDays: features.historyDays ?? 365,
    exportBytesPerDay: features.exportBytesPerDay ?? 0,
    exportRetentionDays: isPro ? 30 : 7,
    apiKeys: features.apiKeys ?? (isPro ? 5 : 1),
    apiRequestsPerDay:
      features.apiRequestsPerDay ?? (isPro ? 100_000 : 10_000),
    apiRatePerMinute: isPro ? 300 : 60,
    backtestRunsPerDay: features.backtestsPerDay ?? (isPro ? 500 : 50),
    backtestMaxDays: features.maxBacktestDays ?? (isPro ? 730 : 90),
    backtestMaxWindows: isPro ? 2_000_000 : 300_000,
    backtestConcurrency: isPro ? 2 : 1,
    savedStrategies: isPro ? 500 : 50,
    resultRetentionDays: isPro ? 180 : 30,
    backtestTrialRuns: 0,
  };
}

export function canDownload(user: CurrentUser): boolean {
  return user.role === "admin" || user.access.isPaid;
}

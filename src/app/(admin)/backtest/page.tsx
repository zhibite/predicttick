import type { Metadata } from "next";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import BacktestRunner from "@/components/backtest/BacktestRunner";
import { requireUser } from "@/server/auth";
import {
  countTrialRuns,
  listRuns,
  listStrategies,
} from "@/server/backtest/service";
import { STRATEGY_EXAMPLES } from "@/server/backtest/examples";
import { getEntitlements } from "@/server/entitlements";
import { listSeriesRows } from "@/server/query/markets";
import { currentUtcDay, getUsage, utcDayFromEpoch } from "@/server/usage";
import { assetLabel } from "@/lib/format";
import { PERIODS } from "@/lib/types";
import type { Period } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Backtest | PolyKlines",
  description:
    "Run custom JavaScript strategies on historical Polymarket Up/Down windows.",
};

export default async function BacktestPage() {
  const user = await requireUser();
  const entitlements = getEntitlements(user);
  const isPaid = user.role === "admin" || user.access.isPaid;
  const isPro =
    user.role === "admin" ||
    (user.access.isPaid && Boolean(user.access.planCode?.startsWith("pro")));
  const series = listSeriesRows();
  const assets = [...new Set(series.map((row) => row.asset))].map((asset) => ({
    asset,
    label: assetLabel(asset),
  }));
  const availablePeriods = PERIODS.filter((period) =>
    series.some((row) => row.period === period),
  );
  const periods: Period[] =
    availablePeriods.length > 0 ? [...availablePeriods] : ["5m"];

  const today = currentUtcDay();
  const todayEpoch = Math.floor(Date.parse(`${today}T00:00:00Z`) / 1000);
  const maxDays = entitlements.backtestMaxDays;
  const defaultFrom = utcDayFromEpoch(todayEpoch - (Math.min(30, maxDays) - 1) * 86_400);
  const trialUsed = countTrialRuns(user.id);

  return (
    <div>
      <PageBreadcrumb pageTitle="Backtest" />
      <p className="mb-6 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        Write a JavaScript strategy and run it over historical windows. Point
        strategies decide once before the close; stream strategies decide on
        every sample. The sandbox has no network or filesystem access and
        cannot see future samples.
      </p>
      <BacktestRunner
        isPaid={isPaid}
        isPro={isPro}
        entitlements={entitlements}
        usage={getUsage(user.id)}
        trialUsed={trialUsed}
        strategies={isPaid ? listStrategies(user.id) : []}
        initialRuns={listRuns(user.id)}
        examples={STRATEGY_EXAMPLES}
        assets={assets.length > 0 ? assets : [{ asset: "btc", label: "Bitcoin" }]}
        periods={periods}
        defaultFrom={defaultFrom}
        defaultTo={today}
      />
    </div>
  );
}

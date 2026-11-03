import type { Metadata } from "next";
import { redirect } from "next/navigation";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import DownloadBuilder from "@/components/download/DownloadBuilder";
import { requireUser } from "@/server/auth";
import { canDownload, getEntitlements } from "@/server/entitlements";
import { listExportJobs } from "@/server/export/jobs";
import { listSeriesRows } from "@/server/query/markets";
import { currentUtcDay, getUsage, utcDayFromEpoch } from "@/server/usage";
import { assetLabel } from "@/lib/format";
import { PERIODS } from "@/lib/types";
import type { Period } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Download data | PolyKlines",
  description: "Export historical Polymarket Up/Down data as CSV.",
};

export default async function DownloadPage() {
  const user = await requireUser();
  if (!canDownload(user)) {
    redirect("/pricing?reason=download");
  }

  const entitlements = getEntitlements(user);
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
  const defaultFrom = utcDayFromEpoch(todayEpoch - 6 * 86_400);
  const earliestDay = utcDayFromEpoch(
    todayEpoch - entitlements.historyDays * 86_400,
  );

  return (
    <div>
      <PageBreadcrumb pageTitle="Download data" />
      <p className="mb-6 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        Export raw samples or market metadata as CSV. Small selections stream
        directly; larger selections run in the background and appear below with
        a download link when ready. Counts and bytes are estimated from the
        daily coverage rollup.
      </p>
      <DownloadBuilder
        assets={assets.length > 0 ? assets : [{ asset: "btc", label: "Bitcoin" }]}
        periods={periods}
        entitlements={entitlements}
        usage={getUsage(user.id)}
        initialJobs={listExportJobs(user.id)}
        defaultFrom={defaultFrom}
        defaultTo={today}
        earliestDay={earliestDay}
      />
    </div>
  );
}

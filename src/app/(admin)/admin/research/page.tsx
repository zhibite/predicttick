import type { Metadata } from "next";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ResearchRuns from "@/components/admin/ResearchRuns";
import { requireAdmin } from "@/server/auth";
import { listResearchRuns } from "@/server/research/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trader research | PolyKlines Admin",
  description:
    "Admin-only attribution ETL that joins a wallet's fills to the local 1-second book.",
};

export default async function AdminResearchPage() {
  await requireAdmin();

  return (
    <div>
      <PageBreadcrumb pageTitle="Trader research" />
      <p className="mb-6 max-w-4xl text-sm text-gray-500 dark:text-gray-400">
        Reverse-engineer a trader with public fills and our own 1-second
        Up/Down book. The ETL stores every fetched fill with entry edge,
        1s/10s/60s/settlement markouts, time-window and price-bucket summaries,
        pair-cost structure and inferred strategy tags. It is admin-only and
        never places orders.
      </p>
      <ResearchRuns initialRuns={listResearchRuns(30)} />
    </div>
  );
}

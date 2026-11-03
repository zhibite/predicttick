import type { Metadata } from "next";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PaperStrategies from "@/components/admin/PaperStrategies";
import { requireAdmin } from "@/server/auth";
import { listPaperStrategies } from "@/server/paper/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paper trading | PolyKlines Admin",
  description:
    "Admin-only paper trading strategies, simulated fills, positions and PnL.",
};

export default async function AdminPaperPage() {
  await requireAdmin();

  return (
    <div>
      <PageBreadcrumb pageTitle="Paper trading" />
      <p className="mb-6 max-w-4xl text-sm text-gray-500 dark:text-gray-400">
        Test trading ideas against live Polymarket Up/Down markets without
        touching a wallet. The engine reads the same 1-second book snapshots as
        the collector, records every simulated fill, marks positions to the
        latest mid and settles them when the collector resolves the market.
        Only administrators can see this page and its API.
      </p>
      <PaperStrategies initialStrategies={listPaperStrategies()} />
    </div>
  );
}

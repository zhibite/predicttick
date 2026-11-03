import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PaperStrategyDetailView from "@/components/paper/PaperStrategyDetailView";
import { requireAdmin } from "@/server/auth";
import { getPaperStrategyDetail } from "@/server/paper/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paper strategy | PolyKlines Admin",
  description:
    "Paper strategy configuration, equity curve, positions, trades and settlements.",
};

export default async function AdminPaperDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const detail = getPaperStrategyDetail(id);
  if (!detail) notFound();

  return (
    <div>
      <PageBreadcrumb pageTitle="Paper strategy" />
      <PaperStrategyDetailView initialDetail={detail} />
    </div>
  );
}

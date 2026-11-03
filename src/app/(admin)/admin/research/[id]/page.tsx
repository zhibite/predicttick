import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ResearchRunDetailView from "@/components/research/ResearchRunDetailView";
import { requireAdmin } from "@/server/auth";
import { getResearchRunDetail } from "@/server/research/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research run | PolyKlines Admin",
  description:
    "Trader attribution run: markouts, pair cost, timing and enriched fills.",
};

export default async function AdminResearchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const detail = getResearchRunDetail(id);
  if (!detail) notFound();

  return (
    <div>
      <PageBreadcrumb pageTitle="Research run" />
      <ResearchRunDetailView initialDetail={detail} />
    </div>
  );
}

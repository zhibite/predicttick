import type { Metadata } from "next";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import LeaderboardAddresses from "@/components/admin/LeaderboardAddresses";
import { requireAdmin } from "@/server/auth";
import { listLeaderboardEntries } from "@/server/leaderboard/store";
import { leaderboardSyncMinutes } from "@/server/leaderboard/sync";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaderboard addresses | PolyKlines Admin",
  description:
    "Manually curate the Polymarket wallets shown on the public trader leaderboard.",
};

export default async function AdminLeaderboardPage() {
  await requireAdmin();

  return (
    <div>
      <PageBreadcrumb pageTitle="Leaderboard addresses" />
      <p className="mb-6 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        The public leaderboard is curated by hand. Collect Polymarket proxy
        wallet addresses from profile URLs or the official leaderboard, add
        them here, and the server will fetch their public positions, closed
        positions, activity and profile. Labels are shown publicly as the
        trader&apos;s display name, while private notes stay admin-only. Hide
        an address to remove it from the public list without deleting its
        history.
      </p>
      <LeaderboardAddresses
        initialUsers={listLeaderboardEntries(true, true)}
        syncMinutes={leaderboardSyncMinutes()}
      />
    </div>
  );
}

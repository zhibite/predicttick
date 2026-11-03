import type { Metadata } from "next";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import MarketExplorer from "@/components/markets/MarketExplorer";
import { PERIODS } from "@/lib/types";
import type { Period } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Markets | PolyKlines",
  description:
    "Browse every Polymarket Up/Down window and inspect its UP and DOWN price series.",
};

interface MarketsPageProps {
  searchParams: Promise<{
    asset?: string;
    period?: string;
    date?: string;
  }>;
}

export default async function MarketsPage({ searchParams }: MarketsPageProps) {
  const params = await searchParams;
  const requestedPeriod = params.period as Period | undefined;
  const period: Period | undefined =
    requestedPeriod && PERIODS.includes(requestedPeriod)
      ? requestedPeriod
      : undefined;

  return (
    <div>
      <PageBreadcrumb pageTitle="Markets" />
      <p className="mb-6 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        Pick a coin, a market length and a UTC day. Every row is one 5-minute,
        15-minute, 1-hour or 4-hour Up/Down window; the chart plots UP and DOWN
        prices collected live from the Polymarket CLOB WebSocket. Sampling is
        every second for 5m, every 5s for 15m, every 10s for 1h and every 30s
        for 4h. The chart refreshes automatically while a window is still
        trading.
      </p>
      <MarketExplorer
        initialAsset={params.asset}
        initialPeriod={period}
        initialDate={params.date}
      />
    </div>
  );
}

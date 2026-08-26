import type { Metadata } from "next";
import { getMarket } from "@/lib/db/markets";
import { getKlinesByTokens } from "@/lib/db/klines";
import WindowCard from "@/components/polymarkets/WindowCard";
import Link from "next/link";
import { assetIcon } from "@/lib/format";

const ASSET_NAMES: Record<string, string> = {
  btc: "Bitcoin",
  eth: "Ethereum",
  bnb: "BNB",
  sol: "Solana",
  doge: "Dogecoin",
  xrp: "XRP",
  hype: "Hyperliquid",
};

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const m = getMarket(slug);
  if (!m) {
    return {
      title: `Market ${slug} not found | PredictTick`,
    };
  }
  const assetName = ASSET_NAMES[m.asset] || m.asset.toUpperCase();
  return {
    title: `${assetName} ${m.period.toUpperCase()} Market ${slug} | PredictTick`,
    description: `${assetName} ${m.period} UP/DOWN prediction market K-lines on Polymarket.`,
  };
}

export default async function MarketBySlugPage({ params }: Props) {
  const { slug } = await params;
  const m = getMarket(slug);
  if (!m) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <div className="text-5xl mb-3">🔍</div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
          Market not found
        </h2>
        <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
          We couldn&apos;t find any market with slug{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
            {slug}
          </code>
          . Double-check the slug or browse by asset / period.
        </p>
        <Link
          href="/polymarket"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400"
        >
          Browse all markets →
        </Link>
      </div>
    );
  }

  const series = getKlinesByTokens(m.asset, m.up_token, m.down_token);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/polymarket?period=${m.period}&asset=${m.asset}`}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brand-500 dark:text-gray-400"
        >
          ← Back to {assetIcon(m.asset)} {m.asset.toUpperCase()} {m.period.toUpperCase()} markets
        </Link>
      </div>
      <WindowCard
        slug={m.slug}
        asset={m.asset}
        period={m.period}
        startEpoch={m.start_epoch}
        endEpoch={m.end_epoch}
        status={m.status}
        volume={m.volume}
        up={series.up}
        down={series.down}
        index={0}
      />
    </div>
  );
}

import type { Metadata } from "next";
import PolymarketMonitor from "@/components/polymarkets/PolymarketMonitor";
import { ASSETS, type Asset } from "@/lib/db/constants";

interface Props {
  searchParams: Promise<{ period?: string; asset?: string }>;
}

const ASSET_NAMES: Record<string, string> = {
  btc: "Bitcoin",
  eth: "Ethereum",
  bnb: "BNB",
  sol: "Solana",
  doge: "Dogecoin",
  xrp: "XRP",
  hype: "Hyperliquid",
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const period = params.period === "5m" || params.period === "15m" ? params.period : "5m";
  const asset = (ASSETS as readonly string[]).includes(params.asset ?? "")
    ? (params.asset as Asset)
    : "btc";

  const periodLabel = period === "5m" ? "5 Minutes" : "15 Minutes";
  const assetName = ASSET_NAMES[asset] || asset.toUpperCase();

  return {
    title: `${assetName} ${periodLabel} K-Line Chart`,
    description: `Track ${assetName} ${periodLabel} UP/DOWN prediction market K-lines on Polymarket. Historical data, volume analysis, and price trends on PredictTick.`,
    keywords: [
      "PredictTick",
      "predicttick.com",
      "Polymarket",
      `${assetName} ${periodLabel}`,
      `${assetName} K-Line`,
      "Polymarket UP DOWN",
      "crypto prediction market",
      asset.toUpperCase(),
      "binary trading history",
    ],
    alternates: {
      canonical: `https://predicttick.com/polymarket?period=${period}&asset=${asset}`,
    },
    openGraph: {
      title: `${assetName} ${periodLabel} K-Line | PredictTick`,
      description: `${assetName} ${periodLabel} UP/DOWN prediction market historical data on PredictTick.`,
      url: `https://predicttick.com/polymarket?period=${period}&asset=${asset}`,
      siteName: "PredictTick",
      type: "website",
    },
  };
}

export default async function PolymarketPage({ searchParams }: Props) {
  const params = await searchParams;
  const period = (params.period === "5m" || params.period === "15m") ? params.period : "5m";
  const asset = (ASSETS as readonly string[]).includes(params.asset ?? "")
    ? (params.asset as Asset)
    : "btc";

  return <PolymarketMonitor initialPeriod={period} initialAsset={asset} />;
}

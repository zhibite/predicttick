import type { Metadata } from "next";
import PolymarketMonitor from "@/components/polymarkets/PolymarketMonitor";

export const metadata: Metadata = {
  title: "Polymarket Up/Down Monitor",
  description: "Polymarket 5m / 15m 历史 K 线监控 - BTC / ETH / BNB / SOL / DOGE / XRP / HYPE",
};

/**
 * 把首页替换成 Polymarket 监控页。
 * 这里故意放在 (admin) 之外，跳过 TailAdmin 的侧边栏占位，
 * 由 PolymarketMonitor 自带暗色导航条。
 */
export default function HomePage() {
  return <PolymarketMonitor />;
}

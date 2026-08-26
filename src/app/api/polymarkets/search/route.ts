import { NextResponse } from "next/server";
import * as markets from "@/lib/db/markets";
import * as klines from "@/lib/db/klines";

export const dynamic = "force-dynamic";

/**
 * GET /api/polymarkets/search?q=btc-updown-5m-1787710592
 * 在 markets.db 中模糊匹配 slug，找到则返回该 market 详情（含 up/down kline），
 * 找不到则返回空 windows 数组。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ q, found: false, windows: [] });
  }

  const matches = markets.searchMarketBySlug(q, 1);
  if (matches.length === 0) {
    return NextResponse.json({ q, found: false, windows: [] });
  }

  const w = matches[0];
  const series = klines.getKlinesByTokens(w.asset, w.up_token, w.down_token);
  return NextResponse.json({
    q,
    found: true,
    windows: [
      {
        slug: w.slug,
        asset: w.asset,
        period: w.period,
        start_epoch: w.start_epoch,
        end_epoch: w.end_epoch,
        status: w.status,
        volume: w.volume,
        up: series.up,
        down: series.down,
      },
    ],
  });
}

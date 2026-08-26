import { NextResponse } from "next/server";
import { ASSETS, PERIODS } from "@/lib/db/constants";
import type { Asset, Period } from "@/lib/db/constants";
import * as klines from "@/lib/db/klines";
import * as markets from "@/lib/db/markets";

export const dynamic = "force-dynamic";

/**
 * GET /api/polymarkets/markets/[asset]/[period]?limit=12&offset=0
 * 返回当前页市场列表，每条附带 up/down kline tick。
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ asset: string; period: string }> },
) {
  const { asset: assetRaw, period: periodRaw } = await ctx.params;
  const asset = assetRaw.toLowerCase() as Asset;
  const period = periodRaw.toLowerCase() as Period;

  if (!ASSETS.includes(asset)) {
    return NextResponse.json(
      { error: "invalid_asset", message: `asset 必须为 ${ASSETS.join("/")}` },
      { status: 400 },
    );
  }
  if (!PERIODS.includes(period)) {
    return NextResponse.json(
      { error: "invalid_period", message: `period 必须为 ${PERIODS.join("/")}` },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "12", 10) || 12, 1),
    48,
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0,
  );

  const page = markets.getMarketsPage(asset, period, limit, offset);

  // 批量拉 kline（每个窗口 up/down 一次 SQL）
  const windows = page.windows.map((w) => {
    const series = klines.getKlinesByTokens(asset, w.up_token, w.down_token);
    return {
      slug: w.slug,
      asset: w.asset,
      period: w.period,
      start_epoch: w.start_epoch,
      end_epoch: w.end_epoch,
      status: w.status,
      volume: w.volume,
      up: series.up,
      down: series.down,
    };
  });

  return NextResponse.json({
    asset: page.asset,
    period: page.period,
    windows,
    total: page.total,
    limit: page.limit,
    offset: page.offset,
  });
}

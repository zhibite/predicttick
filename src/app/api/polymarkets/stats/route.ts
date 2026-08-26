import { NextResponse } from "next/server";
import * as markets from "@/lib/db/markets";
import * as pool from "@/lib/db/pool";

export const dynamic = "force-dynamic";

/**
 * GET /api/polymarkets/stats?limit=200
 * 仪表盘汇总：全市场统计 / 按资产分布 / 按周期分布 / 按状态分布 / 最新 / 高交易量
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "200", 10) || 200, 1),
    500,
  );

  try {
    const summary = markets.getDashboardSummary(limit);
    return NextResponse.json({
      summary,
      assets: pool.ASSETS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "stats_unavailable", message },
      { status: 200 },
    );
  }
}

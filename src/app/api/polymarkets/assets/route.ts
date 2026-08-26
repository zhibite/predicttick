import { NextResponse } from "next/server";
import { ASSETS } from "@/lib/db/constants";
import * as markets from "@/lib/db/markets";

export const dynamic = "force-dynamic";

/**
 * GET /api/polymarkets/assets
 * 返回各资产窗口统计，用于侧边栏导航。
 */
export async function GET() {
  try {
    const stats = markets.getAssetStats();
    return NextResponse.json({ assets: stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "assets_unavailable",
        message,
        assets: ASSETS.map((name) => ({ name, total: 0, periods: {} })),
      },
      { status: 200 },
    );
  }
}

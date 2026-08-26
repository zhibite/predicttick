import { NextResponse } from "next/server";
import { ASSETS, PERIODS } from "@/lib/db/constants";
import type { Asset, Period } from "@/lib/db/constants";
import * as markets from "@/lib/db/markets";

export const dynamic = "force-dynamic";

/**
 * GET /api/polymarkets/markets?asset=btc&period=5m
 * 返回市场元数据列表（不含 kline，用于轻量级列表展示）。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const assetParam = url.searchParams.get("asset")?.toLowerCase();
  const periodParam = url.searchParams.get("period")?.toLowerCase();
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    200,
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0,
  );

  if (assetParam && !ASSETS.includes(assetParam as Asset)) {
    return NextResponse.json(
      { error: "invalid_asset", message: `asset must be one of ${ASSETS.join("/")}` },
      { status: 400 },
    );
  }
  if (periodParam && !PERIODS.includes(periodParam as Period)) {
    return NextResponse.json(
      { error: "invalid_period", message: `period must be one of ${PERIODS.join("/")}` },
      { status: 400 },
    );
  }
  if (!assetParam || !periodParam) {
    return NextResponse.json(
      { error: "missing_params", message: "asset and period query params are required" },
      { status: 400 },
    );
  }

  const page = markets.getMarketsPage(
    assetParam as Asset,
    periodParam as Period,
    limit,
    offset,
  );
  return NextResponse.json(page);
}

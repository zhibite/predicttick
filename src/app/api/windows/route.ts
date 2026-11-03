import { NextResponse } from "next/server";

import { getDayMarkets } from "@/lib/dataset";
import { PERIODS } from "@/lib/types";
import type { Period, WindowsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const SAFE_ASSET = /^[a-z0-9]+$/;
const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const asset = params.get("asset") ?? "";
  const period = params.get("period") ?? "";
  const date = params.get("date") ?? "";

  if (
    !SAFE_ASSET.test(asset) ||
    !PERIODS.includes(period as Period) ||
    !SAFE_DATE.test(date)
  ) {
    return NextResponse.json(
      { error: "Expected asset, period (5m|15m) and date (YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  try {
    const windows = await getDayMarkets(asset, period as Period, date);
    const payload: WindowsResponse = {
      asset,
      period: period as Period,
      date,
      count: windows.length,
      windows,
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error(`GET /api/windows ${asset}/${period}/${date} failed`, error);
    return NextResponse.json(
      { error: "Failed to read the day partition." },
      { status: 500 },
    );
  }
}

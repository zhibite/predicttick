import { PERIODS } from "@/lib/types";
import {
  apiError,
  apiJson,
  apiPreflight,
  decodeCursor,
  encodeCursor,
  parseLimit,
  requireApiKey,
  utcIso,
} from "@/server/api/v1";
import { parseApiRange } from "@/server/api/ranges";
import { listExportMarkets } from "@/server/query/markets";
import { listSamplesInWindowWithBackfill } from "@/server/query/samples";
import type { SampleRow } from "@/server/query/types";

export const dynamic = "force-dynamic";

const SAFE_ASSET = /^[a-z0-9]+$/;
const INTERVALS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
};
const MAX_RANGE_DAYS = 31;

interface Candle {
  t: number;
  up: { open: number | null; high: number | null; low: number | null; close: number | null };
  down: { open: number | null; high: number | null; low: number | null; close: number | null };
  windows: Set<string>;
}

interface CandlesCursor {
  t: number;
}

function price(row: SampleRow, side: "up" | "down"): number | null {
  const mid = row[`${side}_mid`];
  if (mid != null) return mid;
  const last = row[`${side}_last`];
  if (last != null) return last;
  const bid = row[`${side}_bid`];
  const ask = row[`${side}_ask`];
  if (bid != null && ask != null) return (bid + ask) / 2;
  return null;
}

function apply(
  candle: Candle,
  side: "up" | "down",
  value: number | null,
): void {
  if (value == null) return;
  const target = candle[side];
  if (target.open == null) target.open = value;
  target.high = target.high == null ? value : Math.max(target.high, value);
  target.low = target.low == null ? value : Math.min(target.low, value);
  target.close = value;
}

export async function GET(request: Request) {
  const auth = requireApiKey(request, "data:read");
  if (auth.response) return auth.response;
  const { context, meta } = auth;
  const params = new URL(request.url).searchParams;

  const asset = (params.get("asset") ?? "").trim().toLowerCase();
  const period = params.get("period") ?? "";
  if (!SAFE_ASSET.test(asset)) {
    return apiError(request, "BAD_ASSET", "asset is required.", 400, meta);
  }
  if (!PERIODS.includes(period as (typeof PERIODS)[number])) {
    return apiError(
      request,
      "BAD_PERIOD",
      "period must be one of 5m, 15m, 1h, 4h.",
      400,
      meta,
    );
  }
  const interval = params.get("interval") ?? "5m";
  if (!INTERVALS[interval]) {
    return apiError(
      request,
      "BAD_INTERVAL",
      "interval must be one of 1m, 5m, 15m, 1h.",
      400,
      meta,
    );
  }

  const rangeResult = parseApiRange(
    context!.user,
    params.get("from"),
    params.get("to"),
  );
  if (rangeResult.error) {
    return apiError(
      request,
      rangeResult.error.code,
      rangeResult.error.message,
      rangeResult.error.status,
      meta,
    );
  }
  const range = rangeResult.range!;
  if (
    range.toEpochExclusive - range.fromEpoch >
    MAX_RANGE_DAYS * 86_400
  ) {
    return apiError(
      request,
      "RANGE_TOO_LARGE",
      `Candles are limited to ${MAX_RANGE_DAYS} days per request.`,
      400,
      meta,
    );
  }

  const intervalSeconds = INTERVALS[interval];
  const markets = listExportMarkets(
    asset,
    period,
    range.fromEpoch,
    range.toEpochExclusive,
    false,
  );
  const candles = new Map<number, Candle>();
  let seen = 0;

  for (const market of markets) {
    const samples = listSamplesInWindowWithBackfill(
      market.slug,
      market.start_epoch,
      market.end_epoch,
    );
    for (const sample of samples) {
      seen += 1;
      if (seen % 5_000 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      const bucket = Math.floor(sample.ts / intervalSeconds) * intervalSeconds;
      let candle = candles.get(bucket);
      if (!candle) {
        candle = {
          t: bucket,
          up: { open: null, high: null, low: null, close: null },
          down: { open: null, high: null, low: null, close: null },
          windows: new Set(),
        };
        candles.set(bucket, candle);
      }
      candle.windows.add(market.slug);
      apply(candle, "up", price(sample, "up"));
      apply(candle, "down", price(sample, "down"));
    }
  }

  const cursor = decodeCursor<CandlesCursor>(params.get("cursor"));
  const limit = parseLimit(params.get("limit"), 500, 5_000);
  const all = [...candles.values()]
    .filter((candle) => cursor == null || candle.t > cursor.t)
    .sort((a, b) => a.t - b.t);
  const hasMore = all.length > limit;
  const page = hasMore ? all.slice(0, limit) : all;
  const last = page[page.length - 1];

  return apiJson(
    request,
    {
      data: page.map((candle) => ({
        t: candle.t,
        tUtc: utcIso(candle.t),
        up: candle.up,
        down: candle.down,
        windows: candle.windows.size,
      })),
      pagination: {
        limit,
        hasMore,
        nextCursor:
          hasMore && last ? encodeCursor({ t: last.t }) : null,
      },
      meta: {
        asset,
        period,
        interval,
        from: range.from,
        to: range.to,
        requestId: meta!.requestId,
      },
    },
    meta!,
  );
}

export function OPTIONS(request: Request) {
  return apiPreflight(request);
}

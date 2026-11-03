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
import { listMarketsPage } from "@/server/query/markets";

export const dynamic = "force-dynamic";

const SAFE_ASSET = /^[a-z0-9]+$/;
const RESOLUTIONS = new Set(["UP", "DOWN", "UNKNOWN"]);

interface MarketsCursor {
  s: number;
  g: string;
}

export function GET(request: Request) {
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

  const rawResolved = (params.get("resolved") ?? "").toUpperCase();
  if (rawResolved && rawResolved !== "ALL" && !RESOLUTIONS.has(rawResolved)) {
    return apiError(
      request,
      "BAD_RESOLVED",
      "resolved must be UP, DOWN, UNKNOWN or ALL.",
      400,
      meta,
    );
  }
  const resolved = rawResolved && rawResolved !== "ALL" ? rawResolved : null;

  const limit = parseLimit(params.get("limit"), 100, 500);
  const cursor = decodeCursor<MarketsCursor>(params.get("cursor"));
  const rows = listMarketsPage({
    asset,
    period,
    fromEpoch: range.fromEpoch,
    toEpochExclusive: range.toEpochExclusive,
    resolved,
    cursorStart: cursor?.s ?? null,
    cursorSlug: cursor?.g ?? null,
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return apiJson(
    request,
    {
      data: page.map((row) => ({
        slug: row.slug,
        asset: row.asset,
        period: row.period,
        startEpoch: row.start_epoch,
        endEpoch: row.end_epoch,
        startUtc: utcIso(row.start_epoch),
        endUtc: utcIso(row.end_epoch),
        title: row.title ?? "",
        resolved: row.resolved ?? "UNKNOWN",
        sampleCount: row.sample_count,
        coverage: {
          firstTs: row.first_ts,
          lastTs: row.last_ts,
        },
      })),
      pagination: {
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({ s: last.start_epoch, g: last.slug })
            : null,
      },
      meta: {
        asset,
        period,
        from: range.from,
        to: range.to,
        resolved: rawResolved || "ALL",
        requestId: meta!.requestId,
      },
    },
    meta!,
  );
}

export function OPTIONS(request: Request) {
  return apiPreflight(request);
}

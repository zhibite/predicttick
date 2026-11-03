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
import { getEntitlements } from "@/server/entitlements";
import { getMarketRow } from "@/server/query/markets";
import { listSamplesPageWithBackfill } from "@/server/query/samples";

export const dynamic = "force-dynamic";

function parseTimestamp(value: string | null, fallback: number): number {
  if (!value) return fallback;
  if (/^\d+$/.test(value)) return Number(value);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : fallback;
}

interface SamplesCursor {
  t: number;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = requireApiKey(request, "data:read");
  if (auth.response) return auth.response;
  const { context, meta } = auth;
  const { slug } = await params;

  const market = getMarketRow(slug);
  if (!market) {
    return apiError(request, "NOT_FOUND", "Market not found.", 404, meta);
  }
  const entitlements = getEntitlements(context!.user);
  const earliest =
    Math.floor(Date.now() / 1000) - entitlements.historyDays * 86_400;
  if (market.start_epoch < earliest) {
    return apiError(
      request,
      "HISTORY_LIMIT",
      `Your plan can access data from ${utcIso(earliest).slice(0, 10)} onward.`,
      403,
      meta,
    );
  }

  const search = new URL(request.url).searchParams;
  const fromTs = Math.max(
    market.start_epoch,
    parseTimestamp(search.get("from"), market.start_epoch),
  );
  const toTs = Math.min(
    market.end_epoch,
    parseTimestamp(search.get("to"), market.end_epoch),
  );
  if (fromTs >= toTs) {
    return apiError(
      request,
      "BAD_RANGE",
      "from must be before to and inside the market window.",
      400,
      meta,
    );
  }

  const limit = parseLimit(search.get("limit"), 1000, 1000);
  const cursor = decodeCursor<SamplesCursor>(search.get("cursor"));
  const rows = listSamplesPageWithBackfill({
    slug,
    fromTs,
    toTsExclusive: toTs,
    cursorTs: cursor?.t ?? null,
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return apiJson(
    request,
    {
      data: page.map((row) => ({
        ts: row.ts,
        tsUtc: utcIso(row.ts),
        up: {
          bid: row.up_bid,
          ask: row.up_ask,
          mid: row.up_mid,
          last: row.up_last,
        },
        down: {
          bid: row.down_bid,
          ask: row.down_ask,
          mid: row.down_mid,
          last: row.down_last,
        },
        source: row.source ?? "live",
      })),
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore && last ? encodeCursor({ t: last.ts }) : null,
      },
      meta: {
        slug,
        from: utcIso(fromTs),
        to: utcIso(toTs),
        requestId: meta!.requestId,
      },
    },
    meta!,
  );
}

export function OPTIONS(request: Request) {
  return apiPreflight(request);
}

import {
  apiError,
  apiJson,
  apiPreflight,
  requireApiKey,
  utcIso,
} from "@/server/api/v1";
import { getEntitlements } from "@/server/entitlements";
import { getMarketWithStats } from "@/server/query/markets";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = requireApiKey(request, "data:read");
  if (auth.response) return auth.response;
  const { context, meta } = auth;
  const { slug } = await params;

  const market = getMarketWithStats(slug);
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

  return apiJson(
    request,
    {
      data: {
        slug: market.slug,
        asset: market.asset,
        period: market.period,
        startEpoch: market.start_epoch,
        endEpoch: market.end_epoch,
        startUtc: utcIso(market.start_epoch),
        endUtc: utcIso(market.end_epoch),
        title: market.title ?? "",
        resolved: market.resolved ?? "UNKNOWN",
        sampleCount: market.sample_count,
        coverage: {
          firstTs: market.first_ts,
          lastTs: market.last_ts,
        },
      },
      meta: { requestId: meta!.requestId },
    },
    meta!,
  );
}

export function OPTIONS(request: Request) {
  return apiPreflight(request);
}

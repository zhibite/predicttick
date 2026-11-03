import { PERIODS } from "@/lib/types";
import {
  apiError,
  apiJson,
  apiPreflight,
  requireApiKey,
} from "@/server/api/v1";
import { parseApiRange } from "@/server/api/ranges";
import { getCoverage } from "@/server/query/coverage";

export const dynamic = "force-dynamic";

const SAFE_ASSET = /^[a-z0-9]+$/;

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
  const coverage = getCoverage(asset, period, range.from, range.to);

  return apiJson(
    request,
    {
      data: {
        asset,
        period,
        from: range.from,
        to: range.to,
        totals: {
          days: coverage.days,
          markets: coverage.markets,
          resolved: coverage.resolved,
          samples: coverage.samples,
        },
        firstDay: coverage.firstDay,
        lastDay: coverage.lastDay,
        days: coverage.seriesDays.map((day) => ({
          day: day.day,
          markets: day.markets,
          resolved: day.resolved,
          samples: day.samples,
        })),
      },
      meta: { requestId: meta!.requestId },
    },
    meta!,
  );
}

export function OPTIONS(request: Request) {
  return apiPreflight(request);
}

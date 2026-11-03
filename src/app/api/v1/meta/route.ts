import { randomUUID } from "node:crypto";

import {
  apiError,
  apiJson,
  apiPreflight,
  type ApiRequestMeta,
} from "@/server/api/v1";
import { clientIp, rateLimit } from "@/server/http";
import { getCoverage } from "@/server/query/coverage";
import { listSeriesRows } from "@/server/query/markets";

export const dynamic = "force-dynamic";

const ASSET_ORDER = ["btc", "eth", "bnb", "sol", "doge", "xrp", "hype"];

function metaFor(request: Request): ApiRequestMeta {
  const rate = rateLimit(`v1:meta:${clientIp(request)}`, 60, 60_000);
  return { requestId: randomUUID(), rate, plan: "public" };
}

export function GET(request: Request) {
  const meta = metaFor(request);
  if (!meta.rate.ok) {
    const response = apiError(
      request,
      "RATE_LIMITED",
      "Rate limit exceeded.",
      429,
      meta,
    );
    response.headers.set("Retry-After", String(meta.rate.retryAfter));
    return response;
  }

  const series = listSeriesRows();
  const assets = new Map<
    string,
    {
      asset: string;
      series: Array<{
        period: string;
        markets: number;
        samples: number;
        firstDay: string | null;
        lastDay: string | null;
      }>;
    }
  >();

  for (const row of series) {
    const coverage = getCoverage(row.asset, row.period);
    let asset = assets.get(row.asset);
    if (!asset) {
      asset = { asset: row.asset, series: [] };
      assets.set(row.asset, asset);
    }
    asset.series.push({
      period: row.period,
      markets: coverage.markets,
      samples: coverage.samples,
      firstDay: coverage.firstDay,
      lastDay: coverage.lastDay,
    });
  }

  const ordered = [...assets.values()].sort(
    (a, b) =>
      (ASSET_ORDER.indexOf(a.asset) === -1 ? 99 : ASSET_ORDER.indexOf(a.asset)) -
      (ASSET_ORDER.indexOf(b.asset) === -1 ? 99 : ASSET_ORDER.indexOf(b.asset)),
  );
  for (const asset of ordered) {
    asset.series.sort(
      (a, b) =>
        ["5m", "15m", "1h", "4h"].indexOf(a.period) -
        ["5m", "15m", "1h", "4h"].indexOf(b.period),
    );
  }

  return apiJson(
    request,
    {
      data: {
        assets: ordered,
        generatedAt: new Date().toISOString(),
      },
      meta: { plan: "public" },
    },
    meta,
  );
}

export function OPTIONS(request: Request) {
  return apiPreflight(request);
}

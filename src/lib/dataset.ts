import { DB_PATH } from "@/server/db";
import {
  getCollectorStatus,
  getMarketRow,
  getSamplesTotal,
  listDates,
  listDayMarkets,
  listSeriesRows,
} from "@/server/query/markets";
import { listSamples } from "@/server/query/samples";
import { assetLabel } from "@/lib/format";
import { PERIODS } from "@/lib/types";
import type {
  AssetInfo,
  CollectorStatus,
  DatasetSummary,
  KlinePoint,
  MetaResponse,
  Period,
  Resolution,
  SeriesInfo,
  WindowResponse,
  WindowSummary,
} from "@/lib/types";

const ASSET_ORDER = ["btc", "eth", "bnb", "sol", "doge", "xrp", "hype"];
const SAFE_ASSET = /^[a-z0-9]+$/;
const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHORT_SLUG_PATTERN = /^([a-z0-9]+)-updown-(5m|15m|4h)-(\d+)$/;
// 1h markets use a long-form ET slug, e.g.
// bnb-up-or-down-november-1-2026-11am-et
const HOURLY_SLUG_PATTERN = /^([a-z0-9]+)-up-or-down-[a-z0-9-]+$/;

let metaCache: { at: number; data: MetaResponse } | null = null;
const META_TTL_MS = 5_000;

export async function getMeta(): Promise<MetaResponse> {
  if (metaCache && Date.now() - metaCache.at < META_TTL_MS) {
    return metaCache.data;
  }

  const seriesRows = listSeriesRows();
  const totalSamples = getSamplesTotal();
  const statusRow = getCollectorStatus();

  const byAsset = new Map<string, AssetInfo>();
  const bySeries: Record<string, { markets: number; rows: number }> = {};
  let totalMarkets = 0;
  let firstEpoch: number | null = null;
  let lastEpoch: number | null = null;

  for (const row of seriesRows) {
    if (!SAFE_ASSET.test(row.asset)) continue;
    const period = row.period as Period;
    if (!PERIODS.includes(period)) continue;

    const dates = listDates(row.asset, period);

    const series: SeriesInfo = {
      period,
      dates,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      markets: row.markets,
      rows: null,
      fineRows: 0,
    };

    let assetInfo = byAsset.get(row.asset);
    if (!assetInfo) {
      assetInfo = {
        asset: row.asset,
        label: assetLabel(row.asset),
        series: [],
      };
      byAsset.set(row.asset, assetInfo);
    }
    assetInfo.series.push(series);

    totalMarkets += row.markets;
    bySeries[`${row.asset}/${period}`] = { markets: row.markets, rows: 0 };
    if (row.first_epoch != null) {
      firstEpoch =
        firstEpoch == null ? row.first_epoch : Math.min(firstEpoch, row.first_epoch);
    }
    if (row.last_epoch != null) {
      lastEpoch =
        lastEpoch == null ? row.last_epoch : Math.max(lastEpoch, row.last_epoch);
    }
  }

  const assets = [...byAsset.values()].sort((a, b) => {
    const ai = ASSET_ORDER.indexOf(a.asset);
    const bi = ASSET_ORDER.indexOf(b.asset);
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }
    return a.asset.localeCompare(b.asset);
  });
  for (const asset of assets) {
    asset.series.sort(
      (a, b) => PERIODS.indexOf(a.period) - PERIODS.indexOf(b.period),
    );
  }

  const status: CollectorStatus | null = statusRow
    ? {
        startedAt: statusRow.started_at,
        heartbeatAt: statusRow.heartbeat_at,
        wsConnections: statusRow.ws_connections,
        activeMarkets: statusRow.active_markets,
        messagesTotal: statusRow.messages_total,
        samplesTotal: statusRow.samples_total,
        lastError: statusRow.last_error,
      }
    : null;

  const summary: DatasetSummary | null =
    seriesRows.length > 0
      ? {
          generated_at:
            statusRow?.heartbeat_at != null
              ? new Date(statusRow.heartbeat_at * 1000).toISOString()
              : undefined,
          markets: totalMarkets,
          klines_rows: totalSamples,
          fine_markets: 0,
          fine_rows: 0,
          missing_markets: 0,
          start_utc_min:
            firstEpoch != null
              ? new Date(firstEpoch * 1000).toISOString()
              : undefined,
          start_utc_max:
            lastEpoch != null
              ? new Date(lastEpoch * 1000).toISOString()
              : undefined,
          by_series: bySeries,
        }
      : null;

  const data: MetaResponse = {
    assets,
    dataRoot: DB_PATH,
    summary,
    status,
  };
  metaCache = { at: Date.now(), data };
  return data;
}

const marketsCache = new Map<string, { at: number; rows: WindowSummary[] }>();
const MARKETS_TTL_MS = 5_000;

export async function getDayMarkets(
  asset: string,
  period: Period,
  date: string,
): Promise<WindowSummary[]> {
  if (!SAFE_ASSET.test(asset) || !SAFE_DATE.test(date)) return [];
  if (!PERIODS.includes(period)) return [];

  const key = `${asset}/${period}/${date}`;
  const cached = marketsCache.get(key);
  if (cached && Date.now() - cached.at < MARKETS_TTL_MS) return cached.rows;

  const dayStart = Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
  if (!Number.isFinite(dayStart)) return [];
  const dayEnd = dayStart + 86_400;

  const rows = listDayMarkets(asset, period, dayStart, dayEnd);

  const windows: WindowSummary[] = rows.map((row) => {
    const resolvedRaw = (row.resolved ?? "").toUpperCase();
    const resolved: Resolution =
      resolvedRaw === "UP" || resolvedRaw === "DOWN" ? resolvedRaw : "UNKNOWN";
    return {
      slug: row.slug,
      asset,
      period,
      startEpoch: row.start_epoch,
      startUtc: new Date(row.start_epoch * 1000).toISOString(),
      endUtc: new Date(row.end_epoch * 1000).toISOString(),
      title: row.title ?? "",
      resolved,
      numUpPoints: row.n,
      numDownPoints: row.n,
      hasFine: false,
      numFineUpPoints: 0,
      numFineDownPoints: 0,
      volume: null,
    };
  });

  marketsCache.set(key, { at: Date.now(), rows: windows });
  return windows;
}

function pickPrice(
  mid: number | null,
  last: number | null,
  bid: number | null,
  ask: number | null,
): number | null {
  if (mid != null) return mid;
  if (last != null) return last;
  if (bid != null && ask != null) return (bid + ask) / 2;
  return null;
}

export function parseSlug(slug: string):
  | { asset: string; period: Period; startEpoch: number }
  | null {
  const short = SHORT_SLUG_PATTERN.exec(slug);
  if (short) {
    return {
      asset: short[1],
      period: short[2] as Period,
      startEpoch: Number(short[3]),
    };
  }
  const hourly = HOURLY_SLUG_PATTERN.exec(slug);
  if (hourly) {
    return {
      asset: hourly[1],
      period: "1h",
      startEpoch: 0,
    };
  }
  return null;
}

export async function getWindow(slug: string): Promise<WindowResponse | null> {
  const parsed = parseSlug(slug);
  if (!parsed || !SAFE_ASSET.test(parsed.asset)) return null;

  const market = getMarketRow(slug);
  if (!market) return null;

  const rows = listSamples(slug);

  const points: KlinePoint[] = rows.map((row) => ({
    t: row.ts * 1000,
    up: pickPrice(row.up_mid, row.up_last, row.up_bid, row.up_ask),
    down: pickPrice(row.down_mid, row.down_last, row.down_bid, row.down_ask),
    upVolume: null,
    downVolume: null,
  }));

  const resolvedRaw = (market.resolved ?? "").toUpperCase();
  const resolved: Resolution =
    resolvedRaw === "UP" || resolvedRaw === "DOWN" ? resolvedRaw : "UNKNOWN";

  return {
    slug: market.slug,
    asset: market.asset,
    period: market.period as Period,
    startEpoch: market.start_epoch,
    endEpoch: market.end_epoch,
    startUtc: new Date(market.start_epoch * 1000).toISOString(),
    endUtc: new Date(market.end_epoch * 1000).toISOString(),
    title: market.title ?? "",
    resolved,
    volume: null,
    points,
    fine: null,
  };
}

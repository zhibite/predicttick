/**
 * markets.db 读写封装（市场元数据）。
 */
import { getMarketsDb } from "./pool";
import type { Asset, Period } from "./path";

export interface Market {
  slug: string;
  asset: Asset;
  period: Period;
  start_epoch: number;
  up_token: string | null;
  down_token: string | null;
  end_epoch: number;
  status: string;
  volume: number;
}

function rowToMarket(row: any): Market {
  return {
    slug: row.slug,
    asset: row.asset,
    period: row.period,
    start_epoch: row.start_epoch,
    up_token: row.up_token,
    down_token: row.down_token,
    end_epoch: row.end_epoch,
    status: row.status,
    volume: row.volume,
  };
}

/**
 * 各资产各周期的窗口统计，供侧边栏导航使用。
 */
export function getAssetStats(): Array<{
  asset: Asset;
  total: number;
  periods: Partial<Record<Period, number>>;
}> {
  const db = getMarketsDb();
  const rows = db
    .prepare(
      `SELECT asset, period, COUNT(*) AS n
       FROM markets
       WHERE up_token IS NOT NULL
       GROUP BY asset, period`,
    )
    .all() as Array<{ asset: Asset; period: Period; n: number }>;

  const map = new Map<Asset, Map<Period, number>>();
  for (const r of rows) {
    if (!map.has(r.asset)) map.set(r.asset, new Map());
    map.get(r.asset)!.set(r.period, r.n);
  }
  const out: Array<{
    asset: Asset;
    total: number;
    periods: Partial<Record<Period, number>>;
  }> = [];
  for (const [asset, periods] of map) {
    const total = Array.from(periods.values()).reduce((a, b) => a + b, 0);
    out.push({ asset, total, periods: Object.fromEntries(periods) as any });
  }
  out.sort((a, b) => a.asset.localeCompare(b.asset));
  return out;
}

export interface MarketsPageResult {
  asset: Asset;
  period: Period;
  windows: Market[];
  total: number;
  limit: number;
  offset: number;
}

export function getMarketsPage(
  asset: Asset,
  period: Period,
  limit = 12,
  offset = 0,
): MarketsPageResult {
  const db = getMarketsDb();
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM markets
         WHERE asset = ? AND period = ? AND up_token IS NOT NULL`,
      )
      .get(asset, period) as { n: number }
  ).n;

  const rows = db
    .prepare(
      `SELECT slug, asset, period, start_epoch, up_token, down_token,
              end_epoch, status, volume
       FROM markets
       WHERE asset = ? AND period = ? AND up_token IS NOT NULL
       ORDER BY start_epoch DESC
       LIMIT ? OFFSET ?`,
    )
    .all(asset, period, limit, offset) as any[];

  return {
    asset,
    period,
    windows: rows.map(rowToMarket),
    total,
    limit,
    offset,
  };
}

export function getMarket(slug: string): Market | null {
  const db = getMarketsDb();
  const row = db
    .prepare(
      `SELECT slug, asset, period, start_epoch, up_token, down_token,
              end_epoch, status, volume
       FROM markets WHERE slug = ?`,
    )
    .get(slug) as any;
  return row ? rowToMarket(row) : null;
}

/**
 * 模糊匹配 slug（用于顶部搜索框）：精确匹配优先，其次按 slug 前缀/包含匹配。
 */
export function searchMarketBySlug(q: string, limit = 10): Market[] {
  const db = getMarketsDb();
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const rows = db
    .prepare(
      `SELECT slug, asset, period, start_epoch, up_token, down_token,
              end_epoch, status, volume
       FROM markets
       WHERE up_token IS NOT NULL
         AND LOWER(slug) LIKE ?
       ORDER BY
         CASE WHEN LOWER(slug) = ? THEN 0
              WHEN LOWER(slug) LIKE ? THEN 1
              ELSE 2 END,
         start_epoch DESC
       LIMIT ?`,
    )
    .all(`%${needle}%`, needle, `${needle}%`, limit) as any[];
  return rows.map(rowToMarket);
}

/**
 * Dashboard 汇总统计。一次性给出 dashboard 需要的核心指标，
 * 避免重复 N 次小 SQL。
 */
export interface DashboardSummary {
  totals: {
    markets: number;
    assets: number;
    periods: number;
    volume: number;
  };
  byAsset: Array<{
    asset: Asset;
    markets: number;
    markets5m: number;
    markets15m: number;
    volume: number;
  }>;
  byPeriod: Array<{
    period: Period;
    markets: number;
    volume: number;
  }>;
  byStatus: Array<{
    status: string;
    markets: number;
    volume: number;
  }>;
  latest: Array<Market>;
  top: Array<Market & { volume_label: string }>;
  timeRange: { earliest: number; latest: number } | null;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

export function getDashboardSummary(limit = 200): DashboardSummary {
  const db = getMarketsDb();

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS markets,
              SUM(volume) AS volume
       FROM markets WHERE up_token IS NOT NULL`,
    )
    .get() as { markets: number; volume: number | null };

  const byAssetRows = db
    .prepare(
      `SELECT asset,
              COUNT(*) AS markets,
              SUM(CASE WHEN period = '5m' THEN 1 ELSE 0 END) AS markets5m,
              SUM(CASE WHEN period = '15m' THEN 1 ELSE 0 END) AS markets15m,
              SUM(volume) AS volume
       FROM markets
       WHERE up_token IS NOT NULL
       GROUP BY asset
       ORDER BY asset ASC`,
    )
    .all() as Array<{
    asset: Asset;
    markets: number;
    markets5m: number;
    markets15m: number;
    volume: number | null;
  }>;

  const byPeriodRows = db
    .prepare(
      `SELECT period,
              COUNT(*) AS markets,
              SUM(volume) AS volume
       FROM markets
       WHERE up_token IS NOT NULL
       GROUP BY period
       ORDER BY period ASC`,
    )
    .all() as Array<{ period: Period; markets: number; volume: number | null }>;

  const byStatusRows = db
    .prepare(
      `SELECT status,
              COUNT(*) AS markets,
              SUM(volume) AS volume
       FROM markets
       WHERE up_token IS NOT NULL
       GROUP BY status
       ORDER BY markets DESC`,
    )
    .all() as Array<{ status: string; markets: number; volume: number | null }>;

  const latestRows = db
    .prepare(
      `SELECT slug, asset, period, start_epoch, up_token, down_token,
              end_epoch, status, volume
       FROM markets
       WHERE up_token IS NOT NULL
       ORDER BY start_epoch DESC
       LIMIT ?`,
    )
    .all(limit) as any[];

  const topRows = db
    .prepare(
      `SELECT slug, asset, period, start_epoch, up_token, down_token,
              end_epoch, status, volume
       FROM markets
       WHERE up_token IS NOT NULL
       ORDER BY volume DESC
       LIMIT ?`,
    )
    .all(limit) as any[];

  const rangeRow = db
    .prepare(
      `SELECT MIN(start_epoch) AS earliest, MAX(start_epoch) AS latest
       FROM markets WHERE up_token IS NOT NULL`,
    )
    .get() as { earliest: number | null; latest: number | null };

  return {
    totals: {
      markets: totalRow.markets ?? 0,
      assets: byAssetRows.length,
      periods: byPeriodRows.length,
      volume: totalRow.volume ?? 0,
    },
    byAsset: byAssetRows.map((r) => ({
      asset: r.asset,
      markets: r.markets,
      markets5m: r.markets5m,
      markets15m: r.markets15m,
      volume: r.volume ?? 0,
    })),
    byPeriod: byPeriodRows.map((r) => ({
      period: r.period,
      markets: r.markets,
      volume: r.volume ?? 0,
    })),
    byStatus: byStatusRows.map((r) => ({
      status: r.status,
      markets: r.markets,
      volume: r.volume ?? 0,
    })),
    latest: latestRows.map(rowToMarket),
    top: topRows.map((r) => {
      const m = rowToMarket(r);
      return { ...m, volume_label: formatVolume(m.volume) };
    }),
    timeRange:
      rangeRow.earliest !== null && rangeRow.latest !== null
        ? { earliest: rangeRow.earliest, latest: rangeRow.latest }
        : null,
  };
}

export const formatDashboardVolume = formatVolume;

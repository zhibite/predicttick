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

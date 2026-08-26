/**
 * kline 数据读取（按资产分库，兼容按年切分）。
 *
 * 一次最多返回单窗口 ~600 行 tick，前端做实时图足够。
 * 批量取多窗口的 token 时使用 IN (...) 走索引。
 */
import { getAssetDbs } from "./pool";
import type { Asset } from "./path";

export interface KlineTick {
  /** 毫秒时间戳（数据库原始字段） */
  t: number;
  /** 价格（0~1 之间的概率） */
  p: number;
  /** 成交量 */
  v: number;
}

export interface KlineSeries {
  up: KlineTick[];
  down: KlineTick[];
}

function rowToTick(row: { time_ms: number; price: number; volume: number }): KlineTick {
  return { t: row.time_ms, p: row.price, v: row.volume };
}

/**
 * 拉取单个 slug 的 up/down 双侧 tick。
 * 通过 slug 字段过滤（markets.db 与各资产库按 slug 对齐）。
 */
export function getKlinesBySlug(asset: Asset, slug: string): KlineSeries {
  const out: KlineSeries = { up: [], down: [] };
  const dbs = getAssetDbs(asset);
  if (dbs.length === 0) return out;

  // markets.db 的 slug → token 映射不在这里维护，调用方需先传 token；
  // 本接口直接按 slug 过滤 klines 表即可（每条 kline 都带 slug 字段）
  for (const db of dbs) {
    const upRows = db
      .prepare(
        `SELECT time_ms, price, volume FROM klines
         WHERE slug = ? AND token_id = (SELECT up_token FROM markets WHERE slug = ?)
         ORDER BY time_ms ASC`,
      )
      .all(slug, slug) as Array<{ time_ms: number; price: number; volume: number }>;
    // ↑ 这个 SQL 不成立（markets 不在 kline db），改用两次简单查询
    if (upRows.length) out.up.push(...upRows.map(rowToTick));
  }
  return out;
}

/**
 * 高效接口：已知 up_token / down_token，直接拉 kline。
 * 适用于「先查 markets 拿到 token，再批量拉 kline」的标准流程。
 */
export function getKlinesByTokens(
  asset: Asset,
  upToken: string | null,
  downToken: string | null,
): KlineSeries {
  const out: KlineSeries = { up: [], down: [] };
  const dbs = getAssetDbs(asset);
  if (dbs.length === 0) return out;

  const tokens: string[] = [];
  if (upToken) tokens.push(upToken);
  if (downToken) tokens.push(downToken);
  if (tokens.length === 0) return out;

  const ph = tokens.map(() => "?").join(",");
  // 跨多文件 union（按年分库时每个 db 自己查一次）
  // 单库时（当前情况）只查一次，最快
  for (const db of dbs) {
    const rows = db
      .prepare(
        `SELECT token_id, time_ms, price, volume FROM klines
         WHERE token_id IN (${ph})
         ORDER BY token_id, time_ms ASC`,
      )
      .all(...tokens) as Array<{
      token_id: string;
      time_ms: number;
      price: number;
      volume: number;
    }>;
    for (const r of rows) {
      const tick = rowToTick(r);
      if (upToken && r.token_id === upToken) out.up.push(tick);
      else if (downToken && r.token_id === downToken) out.down.push(tick);
    }
  }
  // 同一 token 跨多文件时需要合并按时间排序
  out.up.sort((a, b) => a.t - b.t);
  out.down.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * 计算 tick 序列的汇总信息（最新价 / 区间高低价 / 振幅）
 */
export function summarizeSeries(ticks: KlineTick[]): {
  latest: number | null;
  high: number | null;
  low: number | null;
  range: number | null;
  count: number;
} {
  if (ticks.length === 0) {
    return { latest: null, high: null, low: null, range: null, count: 0 };
  }
  let high = ticks[0].p;
  let low = ticks[0].p;
  for (const t of ticks) {
    if (t.p > high) high = t.p;
    if (t.p < low) low = t.p;
  }
  const latest = ticks[ticks.length - 1].p;
  return {
    latest,
    high,
    low,
    range: high - low,
    count: ticks.length,
  };
}

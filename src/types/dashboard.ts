/**
 * 仪表盘 / API 共用的数据结构。
 * 与 src/lib/db/markets.ts 中的 DashboardSummary 保持一致。
 */
import type { KlineTick } from "@/lib/db/klines";

export interface DashboardAssetRow {
  asset: string;
  markets: number;
  markets5m: number;
  markets15m: number;
  volume: number;
}

export interface DashboardPeriodRow {
  period: "5m" | "15m";
  markets: number;
  volume: number;
}

export interface DashboardStatusRow {
  status: string;
  markets: number;
  volume: number;
}

export interface DashboardMarket {
  slug: string;
  asset: string;
  period: string;
  start_epoch: number;
  up_token: string | null;
  down_token: string | null;
  end_epoch: number;
  status: string;
  volume: number;
  volume_label?: string;
}

export interface DashboardSummary {
  totals: {
    markets: number;
    assets: number;
    periods: number;
    volume: number;
  };
  byAsset: DashboardAssetRow[];
  byPeriod: DashboardPeriodRow[];
  byStatus: DashboardStatusRow[];
  latest: DashboardMarket[];
  top: DashboardMarket[];
  timeRange: { earliest: number; latest: number } | null;
}

export interface DashboardStatsResponse {
  summary: DashboardSummary;
  assets: string[];
  error?: string;
  message?: string;
}

// Re-export for components that pull kline types via this module
export type { KlineTick };

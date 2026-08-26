/**
 * 客户端 / 服务端通用的类型定义。
 *
 * 注意：不要从 "@/lib/db" 引入 namespace，避免把 node:fs 拖进客户端 bundle。
 * KlineTick 类型由 "@/lib/db/klines" 提供，客户端组件也直接引用它。
 */
import type { KlineTick } from "@/lib/db/klines";

export interface WindowResponse {
  slug: string;
  asset: string;
  period: string;
  start_epoch: number;
  end_epoch: number;
  status: string;
  volume: number;
  up: KlineTick[];
  down: KlineTick[];
}

export interface MarketsPageResponse {
  asset: string;
  period: string;
  windows: WindowResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface AssetStat {
  asset: string;
  total: number;
  periods: Partial<Record<"5m" | "15m", number>>;
}

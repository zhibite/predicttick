/**
 * 纯常量定义 - 可在客户端 / 服务端任意引用，无 node:* 依赖。
 */

export const ASSETS = ["btc", "eth", "bnb", "sol", "doge", "xrp", "hype"] as const;
export type Asset = (typeof ASSETS)[number];

export const PERIODS = ["5m", "15m"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_SECONDS: Record<Period, number> = {
  "5m": 300,
  "15m": 900,
};

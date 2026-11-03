import type {
  PaperStrategyConfig,
  PaperStrategyKind,
} from "@/server/paper/types";

export const PAPER_ASSETS = ["btc", "eth", "bnb", "sol", "doge", "xrp", "hype"];
export const PAPER_PERIODS = ["5m", "15m", "1h", "4h"];
export const PAPER_WINDOWS = [
  "0-30s",
  "30-60s",
  "1-2m",
  "2-3m",
  "3-4m",
  "4-5m",
];

export function defaultPaperConfig(
  kind: PaperStrategyKind,
): PaperStrategyConfig {
  if (kind === "pair_lock") {
    return {
      pairNotional: 25,
      minEdge: 0.01,
      feeRate: 0,
      slippageBps: 5,
      maxCostPerMarket: 500,
      maxOpenCost: 2_000,
      minSecondsBetweenEntries: 0,
      maxSampleAgeSeconds: 10,
    };
  }
  return {
    sizeUsd: 5,
    minEdge: 0.005,
    minPrice: 0.3,
    maxPrice: 0.9,
    feeRate: 0,
    makerRebateBps: 0,
    maxCostPerMarket: 50,
    maxOpenCost: 600,
    minSecondsBetweenEntries: 10,
    maxSampleAgeSeconds: 10,
    allowedWindows: ["0-30s", "1-2m", "2-3m", "4-5m"],
  };
}

export function defaultPaperConfigJson(kind: PaperStrategyKind): string {
  return JSON.stringify(defaultPaperConfig(kind), null, 2);
}

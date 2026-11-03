import type {
  TraderLifetimeStats,
  TraderStanding,
} from "@/server/leaderboard/types";

export type ResearchStatus =
  | "QUEUED"
  | "FETCHING"
  | "ENRICHING"
  | "COMPLETE"
  | "ERROR";

export interface ResearchRunRow {
  id: string;
  address: string;
  status: ResearchStatus;
  max_trades: number;
  created_by: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  progress_trades: number;
  enriched_trades: number;
  total_expected: number | null;
  truncated: number;
  error: string | null;
  summary_json: string | null;
}

export interface ResearchTradeRow {
  run_id: string;
  id: string;
  slug: string;
  title: string | null;
  condition_id: string | null;
  outcome: string | null;
  side: string | null;
  price: number;
  size: number;
  usdc_size: number;
  trade_ts: number;
  market_start: number | null;
  market_end: number | null;
  resolved: string | null;
  elapsed: number | null;
  mid_at_fill: number | null;
  mid_1s: number | null;
  mid_10s: number | null;
  mid_60s: number | null;
  mid_end: number | null;
  entry_edge: number | null;
  markout_1s: number | null;
  markout_10s: number | null;
  markout_60s: number | null;
  markout_end: number | null;
}

export interface ResearchTradeInput {
  id: string;
  slug: string;
  condition_id: string | null;
  outcome: string | null;
  side: string | null;
  price: number;
  size: number;
  usdc_size: number;
  trade_ts: number;
}

export interface ResearchHorizonStats {
  count: number;
  entryEdge: number | null;
  entryEdgePositive: number | null;
  markout1s: number | null;
  markout10s: number | null;
  markout60s: number | null;
  markoutEnd: number | null;
  endPositive: number | null;
}

export interface ResearchTimingBucket {
  count: number;
  volume: number;
  volumeShare: number | null;
}

export interface ResearchPairStats {
  markets: number;
  twoSided: number;
  twoSidedShare: number | null;
  pairedCostWeighted: number | null;
  pairedCostMedian: number | null;
  pairedBelowOneShare: number | null;
  lockedProfitEstimate: number;
  imbalanceOver25: number;
}

export interface ResearchActivityStats {
  redeemCount: number;
  redeemValue: number;
  makerRebate: number;
  takerRebate: number;
}

export interface ResearchSummary {
  address: string;
  generatedAt: number;
  coverage: {
    tradesFetched: number;
    enriched: number;
    midCovered: number;
    truncated: boolean;
    firstTradeAt: number | null;
    lastTradeAt: number | null;
    sampleSpanDays: number | null;
  };
  lifetime: TraderLifetimeStats | null;
  standing: TraderStanding | null;
  markout: {
    overall: ResearchHorizonStats;
    byWindow: Record<string, ResearchHorizonStats>;
    byPrice: Record<string, ResearchHorizonStats>;
    byOutcome: Record<string, ResearchHorizonStats>;
  };
  timing: Record<string, ResearchTimingBucket>;
  pair: ResearchPairStats;
  activity: ResearchActivityStats;
  tags: string[];
}

export interface ResearchRunDetail {
  run: ResearchRunRow;
  summary: ResearchSummary | null;
  trades: ResearchTradeRow[];
}

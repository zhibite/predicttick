export type PaperStrategyKind = "pair_lock" | "mid_maker";

export interface PaperStrategyConfig {
  /** Taker fee rate as a fraction, e.g. 0.002 = 0.2%. */
  feeRate?: number;
  /** Maker rebate in basis points of notional, credited on maker fills. */
  makerRebateBps?: number;
  /** Extra taker slippage in basis points. */
  slippageBps?: number;
  /** Maximum USD cost per market (open positions). */
  maxCostPerMarket?: number;
  /** Maximum USD cost across all open positions. */
  maxOpenCost?: number;
  /** Minimum seconds between entries for the same market/outcome. */
  minSecondsBetweenEntries?: number;
  /** Reject samples older than this. */
  maxSampleAgeSeconds?: number;
  /** Minimum edge: 1 - (upAsk + downAsk) for pair_lock; mid - quote for mid_maker. */
  minEdge?: number;

  /** pair_lock: notional per pair. */
  pairNotional?: number;

  /** mid_maker: USD notional per maker fill. */
  sizeUsd?: number;
  minPrice?: number;
  maxPrice?: number;
  /** mid_maker: time windows in which entries are allowed. */
  allowedWindows?: string[];
}

export interface PaperStrategyRow {
  id: string;
  name: string;
  kind: PaperStrategyKind;
  asset: string;
  period: string;
  config_json: string;
  active: number;
  starting_balance: number;
  cash: number;
  realized_pnl: number;
  fees_paid: number;
  last_tick_at: number | null;
  last_error: string | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

export interface PaperStrategySummary extends PaperStrategyRow {
  equity: number;
  positions_value: number;
  open_positions: number;
  trade_count: number;
  settlement_count: number;
  return_pct: number;
}

export interface PaperPositionRow {
  id: string;
  strategy_id: string;
  slug: string;
  asset: string;
  period: string;
  title: string | null;
  outcome: string;
  shares: number;
  cost: number;
  fees: number;
  avg_price: number;
  last_price: number | null;
  last_value: number | null;
  opened_at: number;
  updated_at: number;
  status: string;
  settled_at: number | null;
  settlement_price: number | null;
  realized_pnl: number | null;
}

export interface PaperTradeRow {
  id: string;
  strategy_id: string;
  slug: string;
  asset: string;
  period: string;
  title: string | null;
  outcome: string;
  side: string;
  price: number;
  shares: number;
  notional: number;
  fee: number;
  reason: string | null;
  signal_json: string | null;
  created_at: number;
}

export interface PaperSettlementRow {
  id: string;
  strategy_id: string;
  position_id: string;
  slug: string;
  title: string | null;
  outcome: string;
  shares: number;
  payout: number;
  cost: number;
  fees: number;
  pnl: number;
  created_at: number;
}

export interface PaperEquityRow {
  strategy_id: string;
  ts: number;
  cash: number;
  positions_value: number;
  equity: number;
  realized_pnl: number;
  unrealized_pnl: number;
}

export interface PaperStrategyDetail {
  strategy: PaperStrategySummary;
  positions: PaperPositionRow[];
  trades: PaperTradeRow[];
  settlements: PaperSettlementRow[];
  equity: PaperEquityRow[];
}

export interface PaperTickResult {
  strategies: number;
  trades: number;
  settlements: number;
  errors: string[];
}

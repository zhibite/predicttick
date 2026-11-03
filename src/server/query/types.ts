export interface SeriesRow {
  asset: string;
  period: string;
  markets: number;
  first_epoch: number | null;
  last_epoch: number | null;
}

export interface DateRow {
  d: string;
}

export interface StatusRow {
  started_at: number | null;
  heartbeat_at: number | null;
  ws_connections: number;
  active_markets: number;
  messages_total: number;
  samples_total: number;
  last_error: string | null;
}

export interface DayMarketRow {
  slug: string;
  asset: string;
  period: string;
  start_epoch: number;
  end_epoch: number;
  title: string | null;
  resolved: string | null;
  n: number;
}

export interface MarketRow {
  slug: string;
  asset: string;
  period: string;
  start_epoch: number;
  end_epoch: number;
  title: string | null;
  resolved: string | null;
}

export interface ExportMarketRow extends MarketRow {
  condition_id: string | null;
  up_token: string | null;
  down_token: string | null;
  finalized_at: number | null;
}

export interface ApiMarketRow extends MarketRow {
  sample_count: number;
  first_ts: number | null;
  last_ts: number | null;
}

export interface SampleRow {
  ts: number;
  up_bid: number | null;
  up_ask: number | null;
  up_mid: number | null;
  up_last: number | null;
  down_bid: number | null;
  down_ask: number | null;
  down_mid: number | null;
  down_last: number | null;
  /** "live" for collector rows, "future.news" for reconstructed gaps. */
  source?: string;
}

export interface MarketStatsRow {
  slug: string;
  sample_count: number;
  first_ts: number | null;
  last_ts: number | null;
  up_open: number | null;
  up_high: number | null;
  up_low: number | null;
  up_close: number | null;
  down_open: number | null;
  down_high: number | null;
  down_low: number | null;
  down_close: number | null;
  computed_at: number;
}

export interface SeriesDayRow {
  asset: string;
  period: string;
  day: string;
  markets: number;
  resolved: number;
  samples: number;
  updated_at: number;
}

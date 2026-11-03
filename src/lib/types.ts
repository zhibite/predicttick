export const PERIODS = ["5m", "15m", "1h", "4h"] as const;

export type Period = (typeof PERIODS)[number];

export const PERIOD_SECONDS: Record<Period, number> = {
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
  "4h": 14_400,
};

export type Resolution = "UP" | "DOWN" | "UNKNOWN";

export interface SeriesInfo {
  period: Period;
  dates: string[];
  firstDate: string | null;
  lastDate: string | null;
  markets: number | null;
  rows: number | null;
  fineRows: number | null;
}

export interface AssetInfo {
  asset: string;
  label: string;
  series: SeriesInfo[];
}

export interface SeriesSummary {
  markets: number;
  rows: number;
  fine_markets?: number;
  fine_rows?: number;
}

export interface DatasetSummary {
  generated_at?: string;
  markets?: number;
  klines_rows?: number;
  fine_markets?: number;
  fine_rows?: number;
  missing_markets?: number;
  start_utc_min?: string;
  start_utc_max?: string;
  by_series?: Record<string, SeriesSummary>;
}

export interface CollectorStatus {
  startedAt: number | null;
  heartbeatAt: number | null;
  wsConnections: number;
  activeMarkets: number;
  messagesTotal: number;
  samplesTotal: number;
  lastError: string | null;
}

export interface MetaResponse {
  assets: AssetInfo[];
  dataRoot: string;
  summary: DatasetSummary | null;
  status: CollectorStatus | null;
}

export interface WindowSummary {
  slug: string;
  asset: string;
  period: Period;
  startEpoch: number;
  startUtc: string;
  endUtc: string;
  title: string;
  resolved: Resolution;
  numUpPoints: number;
  numDownPoints: number;
  hasFine: boolean;
  numFineUpPoints: number;
  numFineDownPoints: number;
  volume: number | null;
}

export interface WindowsResponse {
  asset: string;
  period: Period;
  date: string;
  count: number;
  windows: WindowSummary[];
}

export interface KlinePoint {
  t: number;
  up: number | null;
  down: number | null;
  upVolume: number | null;
  downVolume: number | null;
}

export interface WindowResponse {
  slug: string;
  asset: string;
  period: Period;
  startEpoch: number;
  endEpoch: number;
  startUtc: string;
  endUtc: string;
  title: string;
  resolved: Resolution;
  volume: number | null;
  points: KlinePoint[];
  fine: KlinePoint[] | null;
}

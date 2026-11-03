export type SyncStatus = "pending" | "syncing" | "ok" | "error";

export interface LeaderboardUserRow {
  id: string;
  address: string;
  label: string | null;
  notes: string | null;
  active: number;
  sort_priority: number;
  profile_name: string | null;
  profile_pseudonym: string | null;
  profile_bio: string | null;
  profile_image: string | null;
  profile_json: string | null;
  metrics_json: string | null;
  last_synced_at: number | null;
  last_sync_error: string | null;
  last_sync_warning: string | null;
  sync_status: SyncStatus;
  created_at: number;
  updated_at: number;
}

export interface TraderProfile {
  name: string | null;
  pseudonym: string | null;
  bio: string | null;
  image: string | null;
}

export interface LeaderboardPosition {
  asset: string;
  conditionId: string | null;
  title: string | null;
  slug: string | null;
  eventSlug: string | null;
  icon: string | null;
  outcome: string | null;
  outcomeIndex: number | null;
  size: number;
  avgPrice: number;
  curPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  redeemable: boolean;
  endDate: string | null;
}

export interface LeaderboardClosedPosition {
  asset: string;
  conditionId: string | null;
  title: string | null;
  slug: string | null;
  eventSlug: string | null;
  icon: string | null;
  outcome: string | null;
  outcomeIndex: number | null;
  avgPrice: number;
  totalBought: number;
  realizedPnl: number;
  curPrice: number;
  endDate: string | null;
  /** First acquisition of the position (epoch seconds), v2 `first_entry_at`. */
  firstEntryAt: number;
  closedAt: number;
}

export interface LeaderboardActivity {
  id: string;
  txHash: string | null;
  timestamp: number;
  type: string | null;
  side: string | null;
  asset: string;
  conditionId: string | null;
  title: string | null;
  slug: string | null;
  eventSlug: string | null;
  outcome: string | null;
  outcomeIndex: number | null;
  size: number;
  price: number;
  usdcSize: number;
  traderName: string | null;
  traderPseudonym: string | null;
  traderBio: string | null;
  traderImage: string | null;
}

export interface LeaderboardMarketStat {
  key: string;
  title: string;
  slug: string | null;
  eventSlug: string | null;
  volume: number;
  trades: number;
  realizedPnl: number;
  openValue: number;
  unrealizedPnl: number;
}

export interface LeaderboardSizeBucket {
  label: string;
  count: number;
  volume: number;
}

/** Lifetime aggregates from `/v2/user-stats`. */
export interface TraderLifetimeStats {
  joinDate: number | null;
  marketsTraded: number;
  biggestWin: number;
  views: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positionPnl: number;
  economicPnl: number;
  settledPnl: number;
  volumeUsd: number;
  volumeShares: number;
  tradeCount: number;
  makerRebate: number;
  takerRebate: number;
  feesPaid: number;
  updatedAt: number | null;
}

/** All-time standing from `/v2/leaderboard?user=`. */
export interface TraderStanding {
  rankPnl: number | null;
  rankVolume: number | null;
  pnl: number | null;
  volumeShares: number | null;
  userName: string | null;
}

/** One cumulative daily point from `/v2/user-pnl`. */
export interface UserPnlSeriesPoint {
  timestamp: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positionPnl: number;
  economicPnl: number;
  settledPnl: number;
  walletIncome: number;
  makerRebate: number;
  takerRebate: number;
  feesPaid: number;
  volumeUsd: number;
  volumeShares: number;
  tradeCount: number;
}

export interface LeaderboardMetrics {
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positionsValue: number;
  initialValue: number;
  volume: number;
  tradeCount: number;
  buyVolume: number;
  sellVolume: number;
  buyCount: number;
  sellCount: number;
  closedCount: number;
  wins: number;
  losses: number;
  winRate: number | null;
  roi: number | null;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
  avgTradeSize: number;
  largestWin: number;
  largestLoss: number;
  maxDrawdown: number;
  marketsTraded: number;
  openPositions: number;
  firstTradeAt: number | null;
  lastTradeAt: number | null;
  activeDays: number;
  currentStreak: number;
  holdingHours: number | null;
  /** Cost-weighted holding time from first_entry_at → last_event_at. */
  closedHoldingHours: number | null;
  closedHoldingMedianHours: number | null;
  closedHoldingSample: number;
  hourly: number[];
  sizeBuckets: LeaderboardSizeBucket[];
  topMarkets: LeaderboardMarketStat[];
  fetchedTrades: number;
  fetchedClosed: number;
  lifetime: TraderLifetimeStats | null;
  standing: TraderStanding | null;
  updatedAt: number;
}

export interface LeaderboardEntry {
  id: string;
  address: string;
  label: string | null;
  notes?: string | null;
  displayName: string;
  pseudonym: string | null;
  bio: string | null;
  image: string | null;
  active: boolean;
  metrics: LeaderboardMetrics | null;
  lastSyncedAt: number | null;
  lastSyncError: string | null;
  lastSyncWarning: string | null;
  syncStatus: SyncStatus;
  createdAt: number;
}

export interface LeaderboardPnlPoint {
  t: number;
  cumPnl: number;
}

export interface LeaderboardDailyPoint {
  day: string;
  volume: number;
  trades: number;
  realizedPnl: number;
}

export interface LeaderboardTraderDetail {
  user: LeaderboardEntry;
  metrics: LeaderboardMetrics;
  pnlSeries: LeaderboardPnlPoint[];
  daily: LeaderboardDailyPoint[];
  positions: LeaderboardPosition[];
  closedPositions: LeaderboardClosedPosition[];
  activity: LeaderboardActivity[];
}

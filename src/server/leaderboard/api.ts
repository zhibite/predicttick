import type {
  LeaderboardActivity,
  LeaderboardClosedPosition,
  LeaderboardPosition,
  TraderLifetimeStats,
  TraderProfile,
  TraderStanding,
  UserPnlSeriesPoint,
} from "./types";

/**
 * Public Polymarket APIs used to profile manually curated traders.
 *
 * Polymarket retired Data API v1 in late 2026; the v2 endpoints use
 * snake_case payloads and opaque cursors. Gamma still serves public profiles.
 *
 * The endpoints are public and unauthenticated, but they are rate limited, so
 * syncs are sequential-ish (see sync.ts) and every response is parsed
 * defensively: Polymarket occasionally adds or renames fields.
 */
const DATA_API_ROOT = (
  process.env.POLY_DATA_API_URL?.trim() || "https://data-api.polymarket.com"
).replace(/\/+$/, "");
const DATA_API_BASE = DATA_API_ROOT.endsWith("/v2")
  ? DATA_API_ROOT
  : `${DATA_API_ROOT}/v2`;
const GAMMA_API_BASE = (
  process.env.POLY_GAMMA_API_URL?.trim() || "https://gamma-api.polymarket.com"
).replace(/\/+$/, "");

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PAGE = 1_000;

type JsonRecord = Record<string, unknown>;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value)) {
    for (const key of ["data", "results", "items", "points"]) {
      const nested = value[key];
      if (Array.isArray(nested)) return nested.filter(isRecord);
    }
  }
  return [];
}

/** Accept a bare object or a common `{ data: {...} }` wrapper. */
function firstRecord(value: unknown): JsonRecord | null {
  if (isRecord(value)) {
    for (const key of ["data", "result", "profile"]) {
      const nested = value[key];
      if (isRecord(nested)) return nested;
    }
    return value;
  }
  return asArray(value)[0] ?? null;
}

function text(row: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function optionalNumber(row: JsonRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    const parsed =
      typeof value === "string" ? Number(value) : (value as unknown);
    if (typeof parsed === "number" && Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function numberValue(row: JsonRecord, keys: string[], fallback = 0): number {
  return optionalNumber(row, ...keys) ?? fallback;
}

function optionalBoolean(
  row: JsonRecord,
  ...keys: string[]
): boolean | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      if (normalized === "true" || normalized === "1") return true;
      if (normalized === "false" || normalized === "0") return false;
    }
  }
  return null;
}

function boolValue(row: JsonRecord, ...keys: string[]): boolean {
  return optionalBoolean(row, ...keys) ?? false;
}

/** Normalize a Unix timestamp that may arrive in seconds or milliseconds. */
function unixSeconds(value: unknown): number | null {
  const parsed =
    typeof value === "string"
      ? Number(value)
      : typeof value === "number"
        ? value
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed > 1e12 ? parsed / 1000 : parsed);
}

function isoSeconds(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed / 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "PolyKlines/1.0 (+https://predicttick.com)",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Polymarket API responded ${response.status}`);
      }
      return (await response.json()) as unknown;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await sleep(750);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Polymarket API request failed");
}

async function fetchPaged<T>(
  path: string,
  params: Record<string, string>,
  cap: number,
  map: (row: JsonRecord) => T | null,
): Promise<T[]> {
  const pageSize = Math.min(MAX_PAGE, Math.max(1, cap));
  const rows: T[] = [];
  let cursor: string | null = null;

  while (rows.length < cap) {
    const url = new URL(`${DATA_API_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("limit", String(pageSize));
    if (cursor) url.searchParams.set("cursor", cursor);

    const payload = await requestJson(url.toString());
    const page = isRecord(payload) ? asArray(payload.data) : asArray(payload);

    for (const row of page) {
      const mapped = map(row);
      if (mapped) rows.push(mapped);
      if (rows.length >= cap) break;
    }

    const next =
      isRecord(payload) && isRecord(payload.pagination)
        ? text(payload.pagination, "next_cursor")
        : null;
    if (!next || page.length === 0) break;
    cursor = next;
  }

  return rows;
}

export async function fetchPublicProfile(
  address: string,
): Promise<TraderProfile | null> {
  const payload = await requestJson(
    `${GAMMA_API_BASE}/public-profile?address=${encodeURIComponent(address)}`,
  );
  const record = firstRecord(payload);
  if (!record) return null;

  const pseudonym = text(record, "pseudonym");
  const rawName = text(record, "name", "displayName", "displayUsername");
  const displayNamePublic = optionalBoolean(
    record,
    "displayUsernamePublic",
    "display_username_public",
  );

  const profile: TraderProfile = {
    // Hide a non-public profile name in favour of the generated pseudonym.
    name:
      displayNamePublic === false && pseudonym
        ? null
        : rawName,
    pseudonym,
    bio: text(record, "bio"),
    image: text(record, "profileImageOptimized", "profileImage", "image"),
  };
  if (!profile.name && !profile.pseudonym && !profile.image) return null;
  return profile;
}

export async function fetchPortfolioValue(
  address: string,
): Promise<number | null> {
  const payload = await requestJson(
    `${DATA_API_BASE}/value?user=${encodeURIComponent(address)}`,
  );
  const record = firstRecord(payload);
  if (!record) return null;
  return optionalNumber(record, "value");
}

export async function fetchUserStats(
  address: string,
): Promise<TraderLifetimeStats | null> {
  const payload = await requestJson(
    `${DATA_API_BASE}/user-stats?user=${encodeURIComponent(address)}`,
  );
  const record = firstRecord(payload);
  if (!record) return null;

  const pnl = isRecord(record.all_time_pnl) ? record.all_time_pnl : null;

  return {
    joinDate: unixSeconds(record.join_date),
    marketsTraded: numberValue(record, ["trades"]),
    biggestWin: numberValue(record, ["biggest_win"]),
    views: numberValue(record, ["views"]),
    realizedPnl: pnl ? numberValue(pnl, ["realized_pnl"]) : 0,
    unrealizedPnl: pnl ? numberValue(pnl, ["unrealized_pnl"]) : 0,
    positionPnl: pnl ? numberValue(pnl, ["position_pnl"]) : 0,
    economicPnl: pnl ? numberValue(pnl, ["economic_pnl"]) : 0,
    settledPnl: pnl ? numberValue(pnl, ["settled_pnl"]) : 0,
    volumeUsd: pnl ? numberValue(pnl, ["volume_usdc"]) : 0,
    volumeShares: pnl ? numberValue(pnl, ["volume"]) : 0,
    tradeCount: pnl ? numberValue(pnl, ["trade_count"]) : 0,
    makerRebate: pnl ? numberValue(pnl, ["maker_rebate"]) : 0,
    takerRebate: pnl ? numberValue(pnl, ["taker_rebate"]) : 0,
    feesPaid: pnl ? numberValue(pnl, ["fees_paid"]) : 0,
    updatedAt: pnl ? unixSeconds(pnl.timestamp) : null,
  };
}

export async function fetchLeaderboardStanding(
  address: string,
): Promise<TraderStanding | null> {
  const url = new URL(`${DATA_API_BASE}/leaderboard`);
  url.searchParams.set("user", address);
  url.searchParams.set("time_period", "all");
  url.searchParams.set("sort_by", "PNL");
  const payload = await requestJson(url.toString());
  const record = firstRecord(payload);
  if (!record) return null;

  return {
    rankPnl: optionalNumber(record, "rank_pnl"),
    rankVolume: optionalNumber(record, "rank_volume"),
    pnl: optionalNumber(record, "pnl"),
    volumeShares: optionalNumber(record, "volume"),
    userName: text(record, "user_name"),
  };
}

function mapPosition(row: JsonRecord): LeaderboardPosition | null {
  const asset = text(row, "token_id", "asset", "tokenId");
  if (!asset) return null;
  return {
    asset,
    conditionId: text(row, "condition_id", "conditionId"),
    title: text(row, "title"),
    slug: text(row, "slug"),
    eventSlug: text(row, "event_slug", "eventSlug"),
    icon: text(row, "icon"),
    outcome: text(row, "outcome"),
    outcomeIndex: optionalNumber(row, "outcome_index", "outcomeIndex"),
    size: numberValue(row, ["current_size", "size"]),
    avgPrice: numberValue(row, ["avg_price", "avgPrice"]),
    curPrice: numberValue(row, ["current_price", "curPrice"]),
    initialValue: numberValue(row, [
      "entry_cost_usdc",
      "initial_value",
      "initialValue",
    ]),
    currentValue: numberValue(row, ["current_value", "currentValue"]),
    cashPnl: numberValue(row, ["unrealized_pnl", "cashPnl"]),
    percentPnl: numberValue(row, ["percent_pnl", "percentPnl"]),
    totalBought: numberValue(row, ["total_size", "totalBought"]),
    realizedPnl: numberValue(row, ["realized_pnl", "realizedPnl"]),
    redeemable: boolValue(row, "redeemable"),
    endDate: text(row, "end_date", "endDate"),
  };
}

export async function fetchPositions(
  address: string,
): Promise<LeaderboardPosition[]> {
  const cap = envInt("POLY_LEADERBOARD_MAX_POSITIONS", 1000, 100, 10_000);
  return fetchPaged(
    "/positions",
    {
      user: address,
      status: "OPEN",
      include_archived: "false",
    },
    cap,
    mapPosition,
  );
}

function mapClosedPosition(
  row: JsonRecord,
): LeaderboardClosedPosition | null {
  const asset = text(row, "token_id", "asset", "tokenId");
  if (!asset) return null;

  const closedAt =
    unixSeconds(row.last_event_at) ??
    unixSeconds(row.timestamp) ??
    unixSeconds(row.closedAt) ??
    isoSeconds(text(row, "end_date", "endDate")) ??
    0;

  return {
    asset,
    conditionId: text(row, "condition_id", "conditionId"),
    title: text(row, "title"),
    slug: text(row, "slug"),
    eventSlug: text(row, "event_slug", "eventSlug"),
    icon: text(row, "icon"),
    outcome: text(row, "outcome"),
    outcomeIndex: optionalNumber(row, "outcome_index", "outcomeIndex"),
    avgPrice: numberValue(row, ["avg_price", "avgPrice"]),
    totalBought: numberValue(row, ["total_size", "totalBought"]),
    realizedPnl: numberValue(row, ["realized_pnl", "realizedPnl"]),
    curPrice: numberValue(row, ["current_price", "curPrice"]),
    endDate: text(row, "end_date", "endDate"),
    firstEntryAt: unixSeconds(row.first_entry_at) ?? 0,
    closedAt,
  };
}

export async function fetchClosedPositions(
  address: string,
): Promise<LeaderboardClosedPosition[]> {
  const cap = envInt("POLY_LEADERBOARD_MAX_CLOSED", 500, 50, 10_000);
  return fetchPaged(
    "/positions",
    {
      user: address,
      status: "CLOSED",
      sort_by: "TIMESTAMP",
      sort_direction: "DESC",
    },
    cap,
    mapClosedPosition,
  );
}

function mapActivity(row: JsonRecord): LeaderboardActivity | null {
  const type = (text(row, "type") ?? "TRADE").toUpperCase();
  if (type !== "TRADE") return null;

  const asset = text(row, "token_id", "asset", "tokenId");
  const timestamp = unixSeconds(row.timestamp);
  if (!asset || !timestamp) return null;

  const side = text(row, "side")?.toUpperCase() ?? null;
  const size = numberValue(row, ["size"]);
  const price = numberValue(row, ["price"]);
  const usdcSize = optionalNumber(row, "usdc_size", "usdcSize") ?? size * price;
  const txHash = text(row, "transaction_hash", "transactionHash", "txHash");
  const id =
    text(row, "id") ??
    [txHash ?? "no-tx", asset, side ?? "", timestamp, size, price].join(":");

  return {
    id,
    txHash,
    timestamp,
    type,
    side,
    asset,
    conditionId: text(row, "condition_id", "conditionId"),
    title: text(row, "title"),
    slug: text(row, "slug"),
    eventSlug: text(row, "event_slug", "eventSlug"),
    outcome: text(row, "outcome"),
    outcomeIndex: optionalNumber(row, "outcome_index", "outcomeIndex"),
    size,
    price,
    usdcSize,
    traderName: text(row, "name"),
    traderPseudonym: text(row, "pseudonym"),
    traderBio: text(row, "bio"),
    traderImage: text(
      row,
      "profile_image_optimized",
      "profile_image",
      "profileImage",
    ),
  };
}

export async function fetchTrades(
  address: string,
): Promise<LeaderboardActivity[]> {
  const cap = envInt("POLY_LEADERBOARD_MAX_TRADES", 1000, 100, 50_000);
  return fetchPaged(
    "/activity",
    {
      user: address,
      type: "TRADE",
      sort_by: "TIMESTAMP",
      sort_direction: "DESC",
    },
    cap,
    mapActivity,
  );
}

function mapPnlPoint(row: JsonRecord): UserPnlSeriesPoint | null {
  const timestamp = unixSeconds(row.timestamp);
  if (!timestamp) return null;
  return {
    timestamp,
    realizedPnl: numberValue(row, ["realized_pnl"]),
    unrealizedPnl: numberValue(row, ["unrealized_pnl"]),
    positionPnl: numberValue(row, ["position_pnl"]),
    economicPnl: numberValue(row, ["economic_pnl"]),
    settledPnl: numberValue(row, ["settled_pnl"]),
    walletIncome: numberValue(row, ["wallet_income"]),
    makerRebate: numberValue(row, ["maker_rebate"]),
    takerRebate: numberValue(row, ["taker_rebate"]),
    feesPaid: numberValue(row, ["fees_paid"]),
    volumeUsd: numberValue(row, ["volume_usdc"]),
    volumeShares: numberValue(row, ["volume"]),
    tradeCount: numberValue(row, ["trade_count"]),
  };
}

/** Dense cumulative PnL/volume points from `/v2/user-pnl`. */
export async function fetchUserPnlSeries(
  address: string,
  interval = "all",
  fidelity = "1d",
): Promise<UserPnlSeriesPoint[]> {
  const url = new URL(`${DATA_API_BASE}/user-pnl`);
  url.searchParams.set("user", address);
  url.searchParams.set("interval", interval);
  url.searchParams.set("fidelity", fidelity);
  const payload = await requestJson(url.toString());
  const record = firstRecord(payload);
  const points = record ? asArray(record.points) : [];
  return points
    .map(mapPnlPoint)
    .filter((point): point is UserPnlSeriesPoint => point != null);
}

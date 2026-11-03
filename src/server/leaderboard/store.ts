import { randomBytes } from "node:crypto";

import { getAppDb } from "../app-db";
import {
  buildDailySeries,
  buildPnlSeries,
  computeLeaderboardMetrics,
} from "./analytics";
import type {
  LeaderboardActivity,
  LeaderboardClosedPosition,
  LeaderboardEntry,
  LeaderboardMetrics,
  LeaderboardPosition,
  LeaderboardTraderDetail,
  LeaderboardUserRow,
  SyncStatus,
  TraderProfile,
} from "./types";

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeTraderAddress(value: string): string | null {
  // Admins often paste a whole profile URL; accept the first 0x address in it.
  const match = value.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0].toLowerCase() : null;
}

export function parseLeaderboardMetrics(
  raw: string | null,
): LeaderboardMetrics | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as LeaderboardMetrics)
      : null;
  } catch {
    return null;
  }
}

function mapUserRow(row: Record<string, unknown>): LeaderboardUserRow {
  return {
    id: String(row.id ?? ""),
    address: String(row.address ?? ""),
    label: stringOrNull(row.label),
    notes: stringOrNull(row.notes),
    active: Number(row.active ?? 1),
    sort_priority: Number(row.sort_priority ?? 0),
    profile_name: stringOrNull(row.profile_name),
    profile_pseudonym: stringOrNull(row.profile_pseudonym),
    profile_bio: stringOrNull(row.profile_bio),
    profile_image: stringOrNull(row.profile_image),
    profile_json: stringOrNull(row.profile_json),
    metrics_json: stringOrNull(row.metrics_json),
    last_synced_at: numberOrNull(row.last_synced_at),
    last_sync_error: stringOrNull(row.last_sync_error),
    last_sync_warning: stringOrNull(row.last_sync_warning),
    sync_status: (String(row.sync_status ?? "pending") as SyncStatus) ?? "pending",
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function entryFromRow(
  user: LeaderboardUserRow,
  includeNotes: boolean,
): LeaderboardEntry {
  const displayName =
    user.label?.trim() ||
    user.profile_name ||
    user.profile_pseudonym ||
    shortAddress(user.address);

  return {
    id: user.id,
    address: user.address,
    label: user.label,
    ...(includeNotes ? { notes: user.notes } : {}),
    displayName,
    pseudonym: user.profile_pseudonym,
    bio: user.profile_bio,
    image: user.profile_image,
    active: user.active === 1,
    metrics: parseLeaderboardMetrics(user.metrics_json),
    lastSyncedAt: user.last_synced_at,
    lastSyncError: user.last_sync_error,
    lastSyncWarning: user.last_sync_warning,
    syncStatus: user.sync_status,
    createdAt: user.created_at,
  };
}

export function listLeaderboardUsers(
  includeInactive = true,
): LeaderboardUserRow[] {
  const where = includeInactive ? "" : "WHERE active = 1";
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM leaderboard_users ${where}
       ORDER BY active DESC, sort_priority DESC, created_at ASC`,
    )
    .all() as unknown as Record<string, unknown>[];
  return rows.map(mapUserRow);
}

export function getLeaderboardUserById(
  id: string,
): LeaderboardUserRow | null {
  const row = getAppDb()
    .prepare("SELECT * FROM leaderboard_users WHERE id = ?")
    .get(id) as unknown as Record<string, unknown> | undefined;
  return row ? mapUserRow(row) : null;
}

export function getLeaderboardUserByAddress(
  addressInput: string,
): LeaderboardUserRow | null {
  const address = normalizeTraderAddress(addressInput);
  if (!address) return null;
  const row = getAppDb()
    .prepare("SELECT * FROM leaderboard_users WHERE address = ?")
    .get(address) as unknown as Record<string, unknown> | undefined;
  return row ? mapUserRow(row) : null;
}

export function listLeaderboardEntries(
  includeInactive = true,
  includeNotes = false,
): LeaderboardEntry[] {
  return listLeaderboardUsers(includeInactive).map((user) =>
    entryFromRow(user, includeNotes),
  );
}

export function getLeaderboardEntryByAddress(
  address: string,
  includeNotes = false,
): LeaderboardEntry | null {
  const user = getLeaderboardUserByAddress(address);
  return user ? entryFromRow(user, includeNotes) : null;
}

export function getLeaderboardEntryById(
  id: string,
  includeNotes = false,
): LeaderboardEntry | null {
  const user = getLeaderboardUserById(id);
  return user ? entryFromRow(user, includeNotes) : null;
}

export interface CreateLeaderboardInput {
  address: string;
  label?: string | null;
  notes?: string | null;
  active?: boolean;
  sortPriority?: number;
}

export type CreateLeaderboardResult =
  | { user: LeaderboardUserRow }
  | { error: "INVALID_ADDRESS" | "DUPLICATE" };

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createLeaderboardUser(
  input: CreateLeaderboardInput,
): CreateLeaderboardResult {
  const address = normalizeTraderAddress(input.address);
  if (!address) return { error: "INVALID_ADDRESS" };

  const db = getAppDb();
  const existing = db
    .prepare("SELECT id FROM leaderboard_users WHERE address = ?")
    .get(address) as unknown as { id: string } | undefined;
  if (existing) return { error: "DUPLICATE" };

  const now = Math.floor(Date.now() / 1000);
  const id = `lb_${randomBytes(12).toString("hex")}`;

  try {
    db.prepare(
      `INSERT INTO leaderboard_users
         (id, address, label, notes, active, sort_priority,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      address,
      cleanText(input.label),
      cleanText(input.notes),
      input.active === false ? 0 : 1,
      Number.isInteger(input.sortPriority) ? input.sortPriority! : 0,
      now,
      now,
    );
  } catch (error) {
    console.error("createLeaderboardUser failed", error);
    return { error: "DUPLICATE" };
  }

  return { user: getLeaderboardUserById(id)! };
}

export interface UpdateLeaderboardInput {
  label?: string | null;
  notes?: string | null;
  active?: boolean;
  sortPriority?: number;
}

export function updateLeaderboardUser(
  id: string,
  input: UpdateLeaderboardInput,
): LeaderboardUserRow | null {
  const sets: string[] = [];
  const values: Array<string | number | null> = [];

  if (input.label !== undefined) {
    sets.push("label = ?");
    values.push(cleanText(input.label));
  }
  if (input.notes !== undefined) {
    sets.push("notes = ?");
    values.push(cleanText(input.notes));
  }
  if (input.active !== undefined) {
    sets.push("active = ?");
    values.push(input.active ? 1 : 0);
  }
  if (input.sortPriority !== undefined && Number.isInteger(input.sortPriority)) {
    sets.push("sort_priority = ?");
    values.push(input.sortPriority);
  }

  if (sets.length === 0) return getLeaderboardUserById(id);

  sets.push("updated_at = ?");
  values.push(Math.floor(Date.now() / 1000));

  const result = getAppDb()
    .prepare(
      `UPDATE leaderboard_users SET ${sets.join(", ")} WHERE id = ?`,
    )
    .run(...values, id);
  if (Number(result.changes) === 0) return null;
  return getLeaderboardUserById(id);
}

export function deleteLeaderboardUser(id: string): boolean {
  const db = getAppDb();
  const user = getLeaderboardUserById(id);
  if (!user) return false;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM leaderboard_positions WHERE address = ?").run(
      user.address,
    );
    db.prepare(
      "DELETE FROM leaderboard_closed_positions WHERE address = ?",
    ).run(user.address);
    db.prepare("DELETE FROM leaderboard_activity WHERE address = ?").run(
      user.address,
    );
    db.prepare("DELETE FROM leaderboard_users WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return true;
}

function mapPositionRow(row: Record<string, unknown>): LeaderboardPosition {
  return {
    asset: String(row.asset ?? ""),
    conditionId: stringOrNull(row.condition_id),
    title: stringOrNull(row.title),
    slug: stringOrNull(row.slug),
    eventSlug: stringOrNull(row.event_slug),
    icon: stringOrNull(row.icon),
    outcome: stringOrNull(row.outcome),
    outcomeIndex: numberOrNull(row.outcome_index),
    size: Number(row.size ?? 0),
    avgPrice: Number(row.avg_price ?? 0),
    curPrice: Number(row.cur_price ?? 0),
    initialValue: Number(row.initial_value ?? 0),
    currentValue: Number(row.current_value ?? 0),
    cashPnl: Number(row.cash_pnl ?? 0),
    percentPnl: Number(row.percent_pnl ?? 0),
    totalBought: Number(row.total_bought ?? 0),
    realizedPnl: Number(row.realized_pnl ?? 0),
    redeemable: Number(row.redeemable ?? 0) === 1,
    endDate: stringOrNull(row.end_date),
  };
}

export function getStoredPositions(address: string): LeaderboardPosition[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM leaderboard_positions WHERE address = ?
       ORDER BY current_value DESC`,
    )
    .all(address) as unknown as Record<string, unknown>[];
  return rows.map(mapPositionRow);
}

export function replacePositions(
  address: string,
  positions: LeaderboardPosition[],
): void {
  const db = getAppDb();
  const now = Math.floor(Date.now() / 1000);

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM leaderboard_positions WHERE address = ?").run(
      address,
    );
    const insert = db.prepare(
      `INSERT OR REPLACE INTO leaderboard_positions
         (address, asset, condition_id, title, slug, event_slug, icon,
          outcome, outcome_index, size, avg_price, cur_price, initial_value,
          current_value, cash_pnl, percent_pnl, total_bought, realized_pnl,
          redeemable, end_date, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const position of positions) {
      insert.run(
        address,
        position.asset,
        position.conditionId,
        position.title,
        position.slug,
        position.eventSlug,
        position.icon,
        position.outcome,
        position.outcomeIndex,
        position.size,
        position.avgPrice,
        position.curPrice,
        position.initialValue,
        position.currentValue,
        position.cashPnl,
        position.percentPnl,
        position.totalBought,
        position.realizedPnl,
        position.redeemable ? 1 : 0,
        position.endDate,
        now,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function mapClosedPositionRow(
  row: Record<string, unknown>,
): LeaderboardClosedPosition {
  return {
    asset: String(row.asset ?? ""),
    conditionId: stringOrNull(row.condition_id),
    title: stringOrNull(row.title),
    slug: stringOrNull(row.slug),
    eventSlug: stringOrNull(row.event_slug),
    icon: stringOrNull(row.icon),
    outcome: stringOrNull(row.outcome),
    outcomeIndex: numberOrNull(row.outcome_index),
    avgPrice: Number(row.avg_price ?? 0),
    totalBought: Number(row.total_bought ?? 0),
    realizedPnl: Number(row.realized_pnl ?? 0),
    curPrice: Number(row.cur_price ?? 0),
    endDate: stringOrNull(row.end_date),
    firstEntryAt: Number(row.first_entry_at ?? 0),
    closedAt: Number(row.closed_at ?? 0),
  };
}

export function getStoredClosedPositions(
  address: string,
): LeaderboardClosedPosition[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM leaderboard_closed_positions WHERE address = ?
       ORDER BY closed_at DESC`,
    )
    .all(address) as unknown as Record<string, unknown>[];
  return rows.map(mapClosedPositionRow);
}

export function replaceClosedPositions(
  address: string,
  positions: LeaderboardClosedPosition[],
): void {
  const db = getAppDb();

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      "DELETE FROM leaderboard_closed_positions WHERE address = ?",
    ).run(address);
    const insert = db.prepare(
      `INSERT OR REPLACE INTO leaderboard_closed_positions
         (address, asset, condition_id, title, slug, event_slug, icon,
          outcome, outcome_index, avg_price, total_bought, realized_pnl,
          cur_price, end_date, first_entry_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const position of positions) {
      insert.run(
        address,
        position.asset,
        position.conditionId,
        position.title,
        position.slug,
        position.eventSlug,
        position.icon,
        position.outcome,
        position.outcomeIndex,
        position.avgPrice,
        position.totalBought,
        position.realizedPnl,
        position.curPrice,
        position.endDate,
        position.firstEntryAt,
        position.closedAt,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function mapActivityRow(row: Record<string, unknown>): LeaderboardActivity {
  return {
    id: String(row.id ?? ""),
    txHash: stringOrNull(row.tx_hash),
    timestamp: Number(row.timestamp ?? 0),
    type: stringOrNull(row.type),
    side: stringOrNull(row.side),
    asset: String(row.asset ?? ""),
    conditionId: stringOrNull(row.condition_id),
    title: stringOrNull(row.title),
    slug: stringOrNull(row.slug),
    eventSlug: stringOrNull(row.event_slug),
    outcome: stringOrNull(row.outcome),
    outcomeIndex: numberOrNull(row.outcome_index),
    size: Number(row.size ?? 0),
    price: Number(row.price ?? 0),
    usdcSize: Number(row.usdc_size ?? 0),
    traderName: stringOrNull(row.trader_name),
    traderPseudonym: stringOrNull(row.trader_pseudonym),
    traderBio: stringOrNull(row.trader_bio),
    traderImage: stringOrNull(row.trader_image),
  };
}

export function getStoredActivity(address: string): LeaderboardActivity[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM leaderboard_activity WHERE address = ?
       ORDER BY timestamp DESC`,
    )
    .all(address) as unknown as Record<string, unknown>[];
  return rows.map(mapActivityRow);
}

export function replaceActivity(
  address: string,
  activity: LeaderboardActivity[],
): void {
  const db = getAppDb();

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM leaderboard_activity WHERE address = ?").run(
      address,
    );
    const insert = db.prepare(
      `INSERT OR REPLACE INTO leaderboard_activity
         (address, id, tx_hash, timestamp, type, side, asset, condition_id,
          title, slug, event_slug, outcome, outcome_index, size, price,
          usdc_size, trader_name, trader_pseudonym, trader_bio, trader_image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const trade of activity) {
      insert.run(
        address,
        trade.id,
        trade.txHash,
        trade.timestamp,
        trade.type,
        trade.side,
        trade.asset,
        trade.conditionId,
        trade.title,
        trade.slug,
        trade.eventSlug,
        trade.outcome,
        trade.outcomeIndex,
        trade.size,
        trade.price,
        trade.usdcSize,
        trade.traderName,
        trade.traderPseudonym,
        trade.traderBio,
        trade.traderImage,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Clear sync state left behind by a crashed or restarted process. */
export function resetStaleLeaderboardSync(): void {
  getAppDb()
    .prepare(
      "UPDATE leaderboard_users SET sync_status = 'pending' WHERE sync_status = 'syncing'",
    )
    .run();
}

export function markLeaderboardSyncStatus(
  address: string,
  status: SyncStatus,
  error: string | null = null,
): void {
  getAppDb()
    .prepare(
      `UPDATE leaderboard_users
       SET sync_status = ?, last_sync_error = ?, last_sync_warning = NULL,
           updated_at = ?
       WHERE address = ?`,
    )
    .run(status, error, Math.floor(Date.now() / 1000), address);
}

export function saveLeaderboardSyncResult(input: {
  address: string;
  profile: TraderProfile;
  metrics: LeaderboardMetrics;
  warning: string | null;
}): void {
  const now = Math.floor(Date.now() / 1000);
  const profileJson = JSON.stringify(input.profile);

  getAppDb()
    .prepare(
      `UPDATE leaderboard_users SET
         profile_name = COALESCE(?, profile_name),
         profile_pseudonym = COALESCE(?, profile_pseudonym),
         profile_bio = COALESCE(?, profile_bio),
         profile_image = COALESCE(?, profile_image),
         profile_json = COALESCE(?, profile_json),
         metrics_json = ?,
         last_synced_at = ?,
         sync_status = 'ok',
         last_sync_error = NULL,
         last_sync_warning = ?,
         updated_at = ?
       WHERE address = ?`,
    )
    .run(
      input.profile.name,
      input.profile.pseudonym,
      input.profile.bio,
      input.profile.image,
      profileJson,
      JSON.stringify(input.metrics),
      now,
      input.warning,
      now,
      input.address,
    );
}

export function getTraderDetail(
  addressInput: string,
): LeaderboardTraderDetail | null {
  const user = getLeaderboardUserByAddress(addressInput);
  if (!user) return null;

  const entry = entryFromRow(user, false);
  const positions = getStoredPositions(user.address);
  const closedPositions = getStoredClosedPositions(user.address);
  const activity = getStoredActivity(user.address);

  const metrics =
    entry.metrics ??
    computeLeaderboardMetrics({
      positions,
      closedPositions,
      trades: activity,
      portfolioValue: positions.reduce(
        (total, position) => total + position.currentValue,
        0,
      ),
    });

  return {
    user: entry,
    metrics,
    pnlSeries: buildPnlSeries(closedPositions),
    daily: buildDailySeries(activity, closedPositions),
    positions,
    closedPositions,
    activity,
  };
}

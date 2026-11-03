import { createHash, randomBytes } from "node:crypto";

import { getAppDb } from "./app-db";
import type { CurrentUser } from "./user-types";
import { getEntitlements, type Entitlements } from "./entitlements";
import { getUsage } from "./usage";

export interface ApiKeyPublic {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  scopes: string;
  rate_limit_per_min: number | null;
  daily_request_quota: number | null;
  daily_byte_quota: number | null;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

export interface ApiKeyLimits {
  ratePerMinute: number;
  requestsPerDay: number;
  exportBytesPerDay: number;
}

export interface ApiKeyContext {
  key: ApiKeyPublic;
  user: CurrentUser;
  entitlements: Entitlements;
  limits: ApiKeyLimits;
}

interface AuthRow {
  key_id: string;
  key_user_id: string;
  key_name: string;
  key_prefix: string;
  scopes: string;
  rate_limit_per_min: number | null;
  daily_request_quota: number | null;
  daily_byte_quota: number | null;
  key_created_at: number;
  key_last_used_at: number | null;
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  email_verified_at: number | null;
  plan_code: string | null;
  access_until: number | null;
}

const PUBLIC_COLUMNS = `id, user_id, name, prefix, scopes,
  rate_limit_per_min, daily_request_quota, daily_byte_quota,
  created_at, last_used_at, revoked_at`;

function hashKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function listApiKeys(userId: string): ApiKeyPublic[] {
  const rows = getAppDb()
    .prepare(
      `SELECT ${PUBLIC_COLUMNS} FROM api_keys
       WHERE user_id = ?
       ORDER BY created_at DESC`,
    )
    .all(userId) as unknown as ApiKeyPublic[];
  return rows.map((row) => ({ ...row }));
}

export function activeKeyCount(userId: string): number {
  const row = getAppDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM api_keys WHERE user_id = ? AND revoked_at IS NULL",
    )
    .get(userId) as unknown as { n: number };
  return row.n;
}

export type CreateKeyError = "API_NOT_INCLUDED" | "KEY_LIMIT";

export function createApiKey(
  user: CurrentUser,
  name: string,
): { token?: string; key?: ApiKeyPublic; error?: CreateKeyError } {
  const entitlements = getEntitlements(user);
  if (entitlements.apiKeys <= 0) return { error: "API_NOT_INCLUDED" };
  if (activeKeyCount(user.id) >= entitlements.apiKeys) {
    return { error: "KEY_LIMIT" };
  }

  const token = `pk_live_${randomBytes(32).toString("base64url")}`;
  const now = Math.floor(Date.now() / 1000);
  const row: ApiKeyPublic = {
    id: `key_${randomBytes(16).toString("hex")}`,
    user_id: user.id,
    name: name.trim() || "Default key",
    prefix: token.slice(0, 16),
    scopes: "data:read,export:read",
    rate_limit_per_min: null,
    daily_request_quota: null,
    daily_byte_quota: null,
    created_at: now,
    last_used_at: null,
    revoked_at: null,
  };

  getAppDb()
    .prepare(
      `INSERT INTO api_keys
         (id, user_id, name, prefix, key_hash, scopes,
          rate_limit_per_min, daily_request_quota, daily_byte_quota,
          created_at, last_used_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL)`,
    )
    .run(
      row.id,
      row.user_id,
      row.name,
      row.prefix,
      hashKey(token),
      row.scopes,
      row.created_at,
    );

  return { token, key: row };
}

export function revokeApiKey(userId: string, keyId: string): boolean {
  const result = getAppDb()
    .prepare(
      `UPDATE api_keys SET revoked_at = ?
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
    )
    .run(Math.floor(Date.now() / 1000), keyId, userId);
  return Number(result.changes) > 0;
}

export type ApiKeyAuthError = "INVALID_KEY" | "PAYMENT_REQUIRED";

export function authenticateApiKey(token: string): {
  context?: ApiKeyContext;
  error?: ApiKeyAuthError;
} {
  if (!token.startsWith("pk_live_")) return { error: "INVALID_KEY" };

  const row = getAppDb()
    .prepare(
      `SELECT k.id AS key_id, k.user_id AS key_user_id, k.name AS key_name,
              k.prefix AS key_prefix, k.scopes, k.rate_limit_per_min,
              k.daily_request_quota, k.daily_byte_quota,
              k.created_at AS key_created_at, k.last_used_at AS key_last_used_at,
              u.id AS user_id, u.email, u.name, u.role, u.email_verified_at,
              a.plan_code, a.access_until
       FROM api_keys k
       JOIN users u ON u.id = k.user_id
       LEFT JOIN user_access a ON a.user_id = u.id
       WHERE k.key_hash = ? AND k.revoked_at IS NULL`,
    )
    .get(hashKey(token)) as unknown as AuthRow | undefined;

  if (!row) return { error: "INVALID_KEY" };

  const now = Math.floor(Date.now() / 1000);
  const user: CurrentUser = {
    id: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role === "admin" ? "admin" : "user",
    emailVerified: row.email_verified_at != null,
    access: {
      planCode: row.plan_code,
      accessUntil: row.access_until,
      isPaid: row.access_until != null && row.access_until > now,
    },
  };

  const entitlements = getEntitlements(user);
  if (entitlements.apiKeys <= 0) return { error: "PAYMENT_REQUIRED" };
  if (user.role !== "admin" && !user.access.isPaid) {
    return { error: "PAYMENT_REQUIRED" };
  }

  return {
    context: {
      key: {
        id: row.key_id,
        user_id: row.key_user_id,
        name: row.key_name,
        prefix: row.key_prefix,
        scopes: row.scopes,
        rate_limit_per_min: row.rate_limit_per_min,
        daily_request_quota: row.daily_request_quota,
        daily_byte_quota: row.daily_byte_quota,
        created_at: row.key_created_at,
        last_used_at: row.key_last_used_at,
        revoked_at: null,
      },
      user,
      entitlements,
      limits: {
        ratePerMinute:
          row.rate_limit_per_min ?? entitlements.apiRatePerMinute,
        requestsPerDay:
          row.daily_request_quota ?? entitlements.apiRequestsPerDay,
        exportBytesPerDay:
          row.daily_byte_quota ?? entitlements.exportBytesPerDay,
      },
    },
  };
}

export function hasScope(key: ApiKeyPublic, scope: string): boolean {
  return key.scopes
    .split(",")
    .map((value) => value.trim())
    .includes(scope);
}

const touchedAt = new Map<string, number>();

export function touchApiKey(keyId: string): void {
  const now = Date.now();
  const last = touchedAt.get(keyId) ?? 0;
  if (now - last < 60_000) return;
  touchedAt.set(keyId, now);
  getAppDb()
    .prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
    .run(Math.floor(now / 1000), keyId);
}

export function recordApiRequest(userId: string, keyId: string): void {
  const db = getAppDb();
  const day = new Date().toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO usage_daily (user_id, day, api_requests)
     VALUES (?, ?, 1)
     ON CONFLICT(user_id, day) DO UPDATE SET
       api_requests = api_requests + 1`,
  ).run(userId, day);
  db.prepare(
    `INSERT INTO api_usage_daily (key_id, day, requests)
     VALUES (?, ?, 1)
     ON CONFLICT(key_id, day) DO UPDATE SET
       requests = requests + 1`,
  ).run(keyId, day);
}

export function recordApiBytes(
  keyId: string,
  day: string,
  bytes: number,
): void {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  getAppDb()
    .prepare(
      `INSERT INTO api_usage_daily (key_id, day, bytes)
       VALUES (?, ?, ?)
       ON CONFLICT(key_id, day) DO UPDATE SET
         bytes = bytes + excluded.bytes`,
    )
    .run(keyId, day, Math.floor(bytes));
}

export function getDailyRequestQuotaRemaining(
  userId: string,
  requestsPerDay: number,
): number {
  return Math.max(0, requestsPerDay - getUsage(userId).apiRequests);
}

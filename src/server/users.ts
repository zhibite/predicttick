import { getAppDb } from "./app-db";
import type { CurrentUser } from "./user-types";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  email_verified_at: number | null;
  plan_code: string | null;
  access_until: number | null;
}

/**
 * DB-only user lookup used by the standalone jobs process. This module must
 * not import next/headers or next/navigation so it can be bundled separately
 * from the web app.
 */
export function getUserById(userId: string): CurrentUser | null {
  const now = Math.floor(Date.now() / 1000);
  const row = getAppDb()
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.email_verified_at,
              a.plan_code, a.access_until
       FROM users u
       LEFT JOIN user_access a ON a.user_id = u.id
       WHERE u.id = ?`,
    )
    .get(userId) as unknown as UserRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
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
}

export function listUsers(): Array<{
  id: string;
  email: string;
  name: string | null;
  role: string;
  emailVerified: boolean;
  planCode: string | null;
  accessUntil: number | null;
  createdAt: number;
}> {
  const rows = getAppDb()
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.email_verified_at,
              u.created_at, a.plan_code, a.access_until
       FROM users u
       LEFT JOIN user_access a ON a.user_id = u.id
       ORDER BY u.created_at DESC`,
    )
    .all() as unknown as Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    email_verified_at: number | null;
    created_at: number;
    plan_code: string | null;
    access_until: number | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    emailVerified: row.email_verified_at != null,
    planCode: row.plan_code,
    accessUntil: row.access_until,
    createdAt: row.created_at,
  }));
}

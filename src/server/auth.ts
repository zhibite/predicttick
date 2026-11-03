import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAppDb } from "./app-db";
import type { CurrentUser, SessionUser } from "./user-types";

export type { CurrentUser, SessionUser } from "./user-types";

export const SESSION_COOKIE = "poly_session";
const SESSION_TTL_SECONDS = 7 * 86_400;
const EMAIL_TOKEN_TTL_SECONDS = 3_600;

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  email_verified_at: number | null;
  password_hash: string | null;
}

interface SessionRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  email_verified_at: number | null;
  plan_code: string | null;
  access_until: number | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function adminEmails(): Set<string> {
  return new Set(
    (process.env.POLY_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => normalizeEmail(value))
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string): boolean {
  return adminEmails().has(normalizeEmail(email));
}

export function createSessionToken(userId: string): string {
  const db = getAppDb();
  const now = Math.floor(Date.now() / 1000);
  const token = randomBytes(32).toString("base64url");

  db.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").run(
    userId,
    now,
  );
  db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(hashToken(token), userId, now + SESSION_TTL_SECONDS, now);

  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getAppDb();
  const now = Math.floor(Date.now() / 1000);
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.email_verified_at,
              a.plan_code, a.access_until
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN user_access a ON a.user_id = u.id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), now) as unknown as SessionRow | undefined;

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

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/markets");
  return user;
}

export async function logoutCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    getAppDb().prepare("DELETE FROM sessions WHERE id = ?").run(hashToken(token));
  }
  await clearSessionCookie();
}

export interface RegisterResult {
  user?: SessionUser;
  verificationToken?: string;
  error?: "EMAIL_IN_USE" | "INVALID_EMAIL" | "WEAK_PASSWORD";
}

export function registerUser(
  emailInput: string,
  password: string,
  name?: string,
): RegisterResult {
  const email = normalizeEmail(emailInput);
  if (!isValidEmail(email)) return { error: "INVALID_EMAIL" };
  if (password.length < 8) return { error: "WEAK_PASSWORD" };

  const db = getAppDb();
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email) as unknown as { id: string } | undefined;
  if (existing) return { error: "EMAIL_IN_USE" };

  const now = Math.floor(Date.now() / 1000);
  const id = `usr_${randomBytes(16).toString("hex")}`;
  const role = isAdminEmail(email) ? "admin" : "user";

  db.prepare(
    `INSERT INTO users
       (id, email, email_verified_at, name, password_hash, role,
        token_version, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, 0, ?, ?)`,
  ).run(
    id,
    email,
    name?.trim() || null,
    hashPassword(password),
    role,
    now,
    now,
  );

  const verificationToken = createEmailToken(id, "verify_email");

  return {
    user: {
      id,
      email,
      name: name?.trim() || null,
      role: role === "admin" ? "admin" : "user",
      emailVerified: false,
    },
    verificationToken,
  };
}

export interface LoginResult {
  user?: SessionUser;
  unverified?: boolean;
  error?: "INVALID_CREDENTIALS";
}

export function authenticateUser(
  emailInput: string,
  password: string,
): LoginResult {
  const email = normalizeEmail(emailInput);
  const db = getAppDb();
  const row = db
    .prepare(
      `SELECT id, email, name, role, email_verified_at, password_hash
       FROM users WHERE email = ?`,
    )
    .get(email) as unknown as UserRow | undefined;

  if (!row?.password_hash || !verifyPassword(password, row.password_hash)) {
    return { error: "INVALID_CREDENTIALS" };
  }

  if (
    process.env.POLY_REQUIRE_EMAIL_VERIFICATION === "1" &&
    row.email_verified_at == null
  ) {
    return { unverified: true };
  }

  return {
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role === "admin" ? "admin" : "user",
      emailVerified: row.email_verified_at != null,
    },
  };
}

export function createEmailToken(
  userId: string,
  purpose: "verify_email" | "reset_password",
): string {
  const db = getAppDb();
  const now = Math.floor(Date.now() / 1000);
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    `INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at, used_at)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run(hashToken(token), userId, purpose, now + EMAIL_TOKEN_TTL_SECONDS);
  return token;
}

export function consumeEmailToken(
  token: string,
  purpose: "verify_email" | "reset_password",
): string | null {
  const db = getAppDb();
  const now = Math.floor(Date.now() / 1000);
  const row = db
    .prepare(
      `SELECT user_id FROM email_tokens
       WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?`,
    )
    .get(hashToken(token), purpose, now) as unknown as
    | { user_id: string }
    | undefined;
  if (!row) return null;

  const result = db
    .prepare(
      "UPDATE email_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL",
    )
    .run(now, hashToken(token));
  if (Number(result.changes) === 0) return null;
  return row.user_id;
}

export function markEmailVerified(userId: string): void {
  getAppDb()
    .prepare(
      "UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ? AND email_verified_at IS NULL",
    )
    .run(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), userId);
}

export function updatePassword(userId: string, password: string): void {
  const db = getAppDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
  ).run(hashPassword(password), now, userId);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function getUserIdByEmail(emailInput: string): string | null {
  const row = getAppDb()
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(normalizeEmail(emailInput)) as unknown as { id: string } | undefined;
  return row?.id ?? null;
}

export function logEmailLink(kind: string, email: string, link: string): void {
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.POLY_EMAIL_DEV_LOG === "1"
  ) {
    console.log(`[email:${kind}] ${email} -> ${link}`);
  }
}

export function appUrl(): string {
  return (
    process.env.POLY_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

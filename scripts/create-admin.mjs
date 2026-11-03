#!/usr/bin/env node
/**
 * Create or promote an administrator account in the business database.
 *
 * Usage:
 *   POLY_ADMIN_EMAIL=you@example.com POLY_ADMIN_PASSWORD='...' npm run create-admin
 *
 * The app database is created by the Next server on first start; this script
 * creates the users table if it is missing so initial bootstrap still works.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const email = (process.env.POLY_ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.POLY_ADMIN_PASSWORD ?? "";
const name = process.env.POLY_ADMIN_NAME?.trim() || "Administrator";

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(
    "Set POLY_ADMIN_EMAIL to a valid email address.\n" +
      "Example: POLY_ADMIN_EMAIL=you@example.com POLY_ADMIN_PASSWORD='...' npm run create-admin",
  );
  process.exit(1);
}
if (password.length < 8) {
  console.error("Set POLY_ADMIN_PASSWORD to at least 8 characters.");
  process.exit(1);
}

const dbPath =
  process.env.POLY_APP_DB_PATH?.trim() ||
  path.join(process.cwd(), "data", "app", "app.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    email_verified_at INTEGER,
    name TEXT,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");
const passwordHash = `scrypt$${salt}$${hash}`;
const now = Math.floor(Date.now() / 1000);
const id = `usr_${randomBytes(16).toString("hex")}`;

db.prepare(
  `INSERT INTO users
     (id, email, email_verified_at, name, password_hash, role,
      token_version, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, 'admin', 0, ?, ?)
   ON CONFLICT(email) DO UPDATE SET
     email_verified_at = excluded.email_verified_at,
     name = excluded.name,
     password_hash = excluded.password_hash,
     role = 'admin',
     updated_at = excluded.updated_at`,
).run(id, email, now, name, passwordHash, now, now);

const user = db
  .prepare("SELECT id, email, role FROM users WHERE email = ?")
  .get(email);
db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);

console.log(`[admin] ${user.email} is now an administrator (${user.id}).`);
console.log(`[admin] database: ${dbPath}`);
db.close();

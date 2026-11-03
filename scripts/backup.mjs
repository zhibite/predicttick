#!/usr/bin/env node
/**
 * Consistent SQLite backups using VACUUM INTO, gzip-compressed with retention.
 *
 * Usage:
 *   POLY_BACKUP_DIR=/home/ubuntu/polyklines-backups node scripts/backup.mjs
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const backupDir =
  process.env.POLY_BACKUP_DIR?.trim() ||
  path.join(process.cwd(), "data", "backups");
const marketDb =
  process.env.POLY_DB_PATH?.trim() ||
  path.join(process.cwd(), "data", "live", "polyklines.sqlite");
const appDb =
  process.env.POLY_APP_DB_PATH?.trim() ||
  path.join(process.cwd(), "data", "app", "app.sqlite");
const keepApp = Number(process.env.POLY_BACKUP_KEEP_APP ?? 14);
const keepMarket = Number(process.env.POLY_BACKUP_KEEP_MARKET ?? 7);
const includeMarket = process.env.POLY_BACKUP_MARKET !== "0";

mkdirSync(backupDir, { recursive: true });

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function escapeSqlPath(value) {
  return value.replace(/'/g, "''");
}

function prune(prefix, keep) {
  const files = readdirSync(backupDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".sqlite.gz"))
    .map((name) => path.join(backupDir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const file of files.slice(keep)) {
    try {
      unlinkSync(file);
      console.log(`[backup] pruned ${file}`);
    } catch (error) {
      console.warn(`[backup] could not prune ${file}`, error);
    }
  }
}

async function backupOne(label, dbPath, prefix, keep) {
  if (!existsSync(dbPath)) {
    console.log(`[backup] ${label} database not found, skipping: ${dbPath}`);
    return;
  }
  const stamp = timestamp();
  const tempPath = path.join(backupDir, `${prefix}-${stamp}.sqlite`);
  const outPath = `${tempPath}.gz`;
  try {
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec(`VACUUM INTO '${escapeSqlPath(tempPath)}'`);
    db.close();
    await pipeline(
      createReadStream(tempPath),
      createGzip({ level: 6 }),
      createWriteStream(outPath),
    );
    unlinkSync(tempPath);
    const size = statSync(outPath).size;
    console.log(`[backup] ${label} -> ${outPath} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    prune(prefix, keep);
  } catch (error) {
    console.error(`[backup] ${label} failed`, error);
    try { unlinkSync(tempPath); } catch {}
    try { unlinkSync(outPath); } catch {}
    process.exitCode = 1;
  }
}

await backupOne("app", appDb, "app", keepApp);
if (includeMarket) await backupOne("market", marketDb, "market", keepMarket);

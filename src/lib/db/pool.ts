/**
 * 全局只读 SQLite 连接池。
 * better-sqlite3 自身是同步 + 进程内线程安全，模块级缓存即可。
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import {
  ASSETS,
  type Asset,
  fileSizeMb,
  listAssetDbFiles,
  marketsDbPath,
} from "./path";

const SOFT_WARN_MB = 15_000; // 15 GB 软警告
const HARD_LIMIT_MB = 25_000; // 25 GB 触发全表扫描保护

const cache = new Map<string, Database.Database>();
const warnedFiles = new Set<string>();

function open(p: string, label: string): Database.Database {
  if (cache.has(p)) return cache.get(p)!;
  if (!fs.existsSync(p)) {
    throw new Error(`数据库文件不存在: ${p}`);
  }
  const sizeMb = fileSizeMb(p);
  if (sizeMb > SOFT_WARN_MB && !warnedFiles.has(p)) {
    console.warn(
      `[polymarket-db] ${label} 文件超过 ${SOFT_WARN_MB / 1000} GB（当前 ${sizeMb.toFixed(0)} MB），考虑按年分库`,
    );
    warnedFiles.add(p);
  }
  const db = new Database(p, { readonly: true, fileMustExist: true });
  // 只读库不需要 WAL 设置，但加 cache_size 加速重复查询
  try {
    db.pragma("cache_size = -65536"); // 64 MB
    db.pragma("mmap_size = 268435456"); // 256 MB
  } catch {
    /* readonly 模式下部分 pragma 可能被忽略 */
  }
  cache.set(p, db);
  return db;
}

export function getMarketsDb(): Database.Database {
  return open(marketsDbPath(), "markets");
}

/**
 * 返回指定资产的所有 SQLite 连接（兼容按年分库）。
 * 调用方在拼 SQL 时使用 `dbName='btc'` 过滤即可。
 */
export function getAssetDbs(asset: Asset): Database.Database[] {
  const files = listAssetDbFiles(asset);
  return files.map((p) => open(p, `${asset} (${p.split(/[\\/]/).pop()})`));
}

/**
 * 兼容函数：判断单库是否过大，超过硬上限返回 true。
 */
export function isAssetOversized(asset: Asset): boolean {
  return listAssetDbFiles(asset).some((p) => fileSizeMb(p) > HARD_LIMIT_MB);
}

export function closeAll(): void {
  for (const db of cache.values()) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
  cache.clear();
}

export { ASSETS };

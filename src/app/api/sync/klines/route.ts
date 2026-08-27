/**
 * Kline sync API - 批量写入/更新 klines
 * body: { asset: string, klines: KlineInput[] }
 */
// Sync API 必须用 Node.js runtime（better-sqlite3 是 native binding）
export const runtime = "nodejs";
// 不缓存结果，每次都是实时数据
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { listAssetDbFiles } from "@/lib/db/path";
import path from "node:path";

// 复用 db 句柄，避免每次请求 open/close 文件
// key = 绝对路径
const dbCache = new Map<string, Database.Database>();

function getDb(filePath: string): Database.Database {
  let db = dbCache.get(filePath);
  if (!db) {
    db = new Database(filePath);
    const jm = (db.pragma("journal_mode", { simple: true }) as string).trim();
    if (jm !== "wal") db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL"); // 写性能显著提升
    db.pragma("temp_store = MEMORY");
    db.pragma("cache_size = -32000"); // 32MB cache
    db.pragma("wal_autocheckpoint = 1000"); // 每 1000 页自动 checkpoint
    dbCache.set(filePath, db);
  }
  return db;
}

interface KlineInput {
  token_id: string;
  slug: string;
  period?: string;
  time_ms: number;
  price: number;
  volume: number;
}

function derivePeriod(slug: string): string {
  // btc-up-or-down-5m-1764042000 -> "5m"
  const m = /-(15m|5m|1m|30m|1h)-/.exec(slug);
  return m ? m[1] : "5m";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const asset: string = body.asset;
    const klines: KlineInput[] = Array.isArray(body.klines) ? body.klines : [];

    if (!asset || klines.length === 0) {
      return NextResponse.json({ inserted: 0 });
    }

    // 找到最新的 db 文件（按年分库时找最新的）
    const files = listAssetDbFiles(asset as any);
    if (files.length === 0) {
      return NextResponse.json({ error: `No db file found for asset: ${asset}` }, { status: 404 });
    }

    // 使用最新的文件
    const targetDb = files.sort().at(-1)!;
    const db = getDb(targetDb);

    // 探测表结构，决定要绑哪些列
    const cols = db.prepare("PRAGMA table_info(klines)").all() as { name: string }[];
    const colSet = new Set(cols.map((c) => c.name));
    const hasPeriod = colSet.has("period");

    // 如果表没有 period 列但 payload 要求，扩表（兼容 gmgndata 旧结构）
    if (hasPeriod) {
      // gmgndata 表已含 period 列，按表实际结构写
    } else {
      // 不动 DDL，由客户端通过 state 接口感知；当前表没 period 不影响
    }

    // 动态构建 INSERT（只绑表里有的列）
    const fields = ["token_id", "slug", "time_ms", "price", "volume"];
    if (hasPeriod) fields.push("period");
    const placeholders = fields.map((f) => `@${f}`).join(", ");
    const insertSql = `INSERT OR REPLACE INTO klines (${fields.join(", ")}) VALUES (${placeholders})`;
    const insert = db.prepare(insertSql);

    const insertMany = db.transaction((items: KlineInput[]) => {
      for (const k of items) {
        const row: Record<string, any> = {
          token_id: k.token_id,
          slug: k.slug,
          time_ms: k.time_ms,
          price: k.price,
          volume: k.volume,
        };
        if (hasPeriod) {
          row.period = (k.period && k.period.length > 0) ? k.period : derivePeriod(k.slug);
        }
        insert.run(row);
      }
    });

    insertMany(klines);
    // 不关闭 db，复用句柄

    return NextResponse.json({ inserted: klines.length, asset, file: path.basename(targetDb) });
  } catch (err) {
    console.error("[sync/klines]", err);
    return NextResponse.json({ error: "Internal error", detail: String(err) }, { status: 500 });
  }
}

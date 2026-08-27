/**
 * Sync state API - 返回服务端当前同步进度
 * 客户端据此判断从哪个时间点开始同步
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { marketsDbPath, listAssetDbFiles } from "@/lib/db/path";
import fs from "node:fs";

const roDbCache = new Map<string, Database.Database>();

function getReadonlyDb(filePath: string): Database.Database {
  let db = roDbCache.get(filePath);
  if (!db) {
    db = new Database(filePath, { readonly: true });
    db.pragma("cache_size = -32000");
    db.pragma("temp_store = MEMORY");
    roDbCache.set(filePath, db);
  }
  return db;
}

interface SyncState {
  timestamp: number;
  markets: {
    maxStartEpoch: number;
    count: number;
  };
  klines: Record<string, {
    maxTimeMs: number;
    count: number;
  }>;
}

export async function GET(request: NextRequest) {
  try {
    const t0 = Date.now();
    const state: SyncState = {
      timestamp: Date.now(),
      markets: { maxStartEpoch: 0, count: 0 },
      klines: {},
    };

    // markets.db
    const marketsPath = marketsDbPath();
    const t1 = Date.now();
    if (fs.existsSync(marketsPath)) {
      try {
        const db = getReadonlyDb(marketsPath);
        const t2 = Date.now();
        const maxRow = db.prepare(
          "SELECT COALESCE(MAX(start_epoch), 0) as maxStartEpoch FROM markets"
        ).get() as { maxStartEpoch: number };
        const t3 = Date.now();
        let count = 0;
        try {
          const stat: string = db.pragma("page_count", { simple: true }) as string;
          if (stat) count = parseInt(stat.trim(), 10) * 10;
        } catch { /* 忽略 */ }
        const t4 = Date.now();
        if (count === 0) {
          const c = db.prepare("SELECT COUNT(*) as c FROM markets").get() as { c: number };
          count = c.c;
        }
        state.markets = { maxStartEpoch: maxRow.maxStartEpoch, count };
        console.log(`[sync/state] markets: open=${t2-t1}ms, max=${t3-t2}ms, count=${t4-t3}ms, total=${t4-t1}ms`);
      } catch (err) {
        console.warn("[sync/state] markets.db corrupted, skipping:", String(err));
      }
    } else {
      console.log(`[sync/state] markets.db not found at: ${marketsPath}`);
    }

    // 各资产 klines（先串行走，减少线程开销；db 打开本身有 WAL 开销）
    const assets = ["btc", "eth", "bnb", "sol", "doge", "xrp", "hype"] as const;
    const t0k = Date.now();

    for (const asset of assets) {
      const files = listAssetDbFiles(asset);
      if (files.length === 0) continue;

      let maxTimeMs = 0;
      let count = 0;
      let anyOk = false;
      for (const file of files) {
        try {
          const db = getReadonlyDb(file);
          const row = db.prepare(
            "SELECT COALESCE(MAX(time_ms), 0) as maxTimeMs, COUNT(*) as count FROM klines"
          ).get() as { maxTimeMs: number; count: number };
          maxTimeMs = Math.max(maxTimeMs, row.maxTimeMs);
          count += row.count;
          anyOk = true;
        } catch (err) {
          console.warn(`[sync/state] ${file} corrupted, skipping:`, String(err));
        }
      }
      if (anyOk) {
        state.klines[asset] = { maxTimeMs, count };
      }
    }
    console.log(`[sync/state] klines: total=${Date.now() - t0k}ms`);

    return NextResponse.json(state);
  } catch (err) {
    console.error("[sync/state]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

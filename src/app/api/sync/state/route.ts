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
    const state: SyncState = {
      timestamp: Date.now(),
      markets: { maxStartEpoch: 0, count: 0 },
      klines: {},
    };

    // markets.db
    const marketsPath = marketsDbPath();
    if (fs.existsSync(marketsPath)) {
      try {
        const db = getReadonlyDb(marketsPath);
        const row = db.prepare(
          "SELECT COALESCE(MAX(start_epoch), 0) as maxStartEpoch, COUNT(*) as count FROM markets"
        ).get() as { maxStartEpoch: number; count: number };
        state.markets = { maxStartEpoch: row.maxStartEpoch, count: row.count };
      } catch (err) {
        console.warn("[sync/state] markets.db corrupted, skipping:", String(err));
      }
    }

    // 并行探测 8 个资产 db 的状态（避免串行等待）
    const assets = ["btc", "eth", "bnb", "sol", "doge", "xrp", "hype"] as const;

    await Promise.all(
      assets.map(async (asset) => {
        const files = listAssetDbFiles(asset);
        if (files.length === 0) return;

        let maxTimeMs = 0;
        let count = 0;
        let anyOk = false;

        await Promise.all(
          files.map(async (file) => {
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
          })
        );

        if (anyOk) {
          state.klines[asset] = { maxTimeMs, count };
        }
      })
    );

    return NextResponse.json(state);
  } catch (err) {
    console.error("[sync/state]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

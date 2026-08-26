/**
 * Sync state API - 返回服务端当前同步进度
 * 客户端据此判断从哪个时间点开始同步
 */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { marketsDbPath, listAssetDbFiles } from "@/lib/db/path";
import fs from "node:fs";

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
        const db = new Database(marketsPath, { readonly: true });
        const row = db.prepare(
          "SELECT COALESCE(MAX(start_epoch), 0) as maxStartEpoch, COUNT(*) as count FROM markets"
        ).get() as { maxStartEpoch: number; count: number };
        state.markets = { maxStartEpoch: row.maxStartEpoch, count: row.count };
        db.close();
      } catch (err) {
        console.warn("[sync/state] markets.db corrupted, skipping:", String(err));
      }
    }

    // 各资产 klines（容忍损坏的 db 文件）
    const assets = ["btc", "eth", "bnb", "sol", "doge", "xrp", "hype"] as const;
    for (const asset of assets) {
      const files = listAssetDbFiles(asset);
      if (files.length === 0) continue;

      let maxTimeMs = 0;
      let count = 0;
      let anyOk = false;
      for (const file of files) {
        try {
          const db = new Database(file, { readonly: true });
          const row = db.prepare(
            "SELECT COALESCE(MAX(time_ms), 0) as maxTimeMs, COUNT(*) as count FROM klines"
          ).get() as { maxTimeMs: number; count: number };
          maxTimeMs = Math.max(maxTimeMs, row.maxTimeMs);
          count += row.count;
          anyOk = true;
          db.close();
        } catch (err) {
          console.warn(`[sync/state] ${file} corrupted, skipping:`, String(err));
        }
      }
      if (anyOk) {
        state.klines[asset] = { maxTimeMs, count };
      }
    }

    return NextResponse.json(state);
  } catch (err) {
    console.error("[sync/state]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

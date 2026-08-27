/**
 * Sync state API - 返回服务端当前同步进度
 * 客户端据此判断从哪个时间点开始同步
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { Worker } from "node:worker_threads";
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

    // 各资产 klines 用 worker_threads 真正并行（better-sqlite3 同步调用会阻塞 event loop）
    const assets = ["btc", "eth", "bnb", "sol", "doge", "xrp", "hype"] as const;
    const t0k = Date.now();

    // 1) 先收集所有 db 文件
    const tasks: { id: number; asset: string; file: string }[] = [];
    let __id = 0;
    for (const asset of assets) {
      for (const file of listAssetDbFiles(asset)) {
        tasks.push({ id: __id++, asset, file });
      }
    }

    // 2) 在 worker 里并行跑 MAX+COUNT
    const workerCode = `
      const { parentPort } = require("worker_threads");
      const Database = require("better-sqlite3");
      parentPort.on("message", ({ id, file }) => {
        try {
          const db = new Database(file, { readonly: true });
          db.pragma("cache_size = -8000"); // 小一点的 cache 即可（仅查 max/count）
          const row = db.prepare(
            "SELECT COALESCE(MAX(time_ms), 0) as maxTimeMs, COUNT(*) as count FROM klines"
          ).get();
          db.close();
          parentPort.postMessage({ id, ok: true, maxTimeMs: row.maxTimeMs, count: row.count });
        } catch (e) {
          parentPort.postMessage({ id, ok: false, error: String(e) });
        }
      });
    `;

    const CONCURRENCY = 4; // 最多同时打开 4 个 db（避免 IO 拥塞）
    const results: Array<{ id: number; ok: boolean; maxTimeMs: number; count: number; error?: string }> = [];
    let active = 0;

    await new Promise<void>((resolveAll) => {
      const queue = tasks.map((t) => t);

      const launchNext = () => {
        while (active < CONCURRENCY && queue.length > 0) {
          const task = queue.shift()!;
          active++;
          const worker = new Worker(workerCode, { eval: true });
          worker.on("message", (msg) => {
            results.push(msg);
            active--;
            if (results.length === tasks.length) {
              resolveAll();
            } else {
              launchNext();
            }
          });
          worker.on("error", (err) => {
            results.push({ id: task.id, ok: false, maxTimeMs: 0, count: 0, error: String(err) });
            active--;
            if (results.length === tasks.length) resolveAll();
            else launchNext();
          });
          worker.postMessage({ id: task.id, file: task.file });
        }
      };

      if (tasks.length === 0) resolveAll();
      else launchNext();
    });

    // 3) 汇总（按 asset 分组）
    const byAsset = new Map<string, { maxTimeMs: number; count: number; anyOk: boolean }>();
    for (const r of results) {
      const t = tasks.find((x) => x.id === r.id);
      if (!t) continue;
      const cur = byAsset.get(t.asset) ?? { maxTimeMs: 0, count: 0, anyOk: false };
      if (r.ok) {
        cur.maxTimeMs = Math.max(cur.maxTimeMs, r.maxTimeMs);
        cur.count += r.count;
        cur.anyOk = true;
      } else {
        console.warn(`[sync/state] ${t.file} corrupted: ${r.error}`);
      }
      byAsset.set(t.asset, cur);
    }
    for (const [asset, v] of byAsset) {
      if (v.anyOk) state.klines[asset] = { maxTimeMs: v.maxTimeMs, count: v.count };
    }

    // 慢文件日志（>500ms 视为瓶颈）
    const slow = results.filter((r) => r.ok).map((r) => {
      const t = tasks.find((x) => x.id === r.id)!;
      return { file: t.file.replace(/^.*\//, ""), count: r.count };
    }).sort((a, b) => b.count - a.count).slice(0, 5);
    console.log(`[sync/state] klines: ${tasks.length} files, total=${Date.now() - t0k}ms, top by rows:`, slow);

    return NextResponse.json(state);
  } catch (err) {
    console.error("[sync/state]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

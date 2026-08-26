/**
 * Kline sync API - 批量写入/更新 klines
 * body: { asset: string, klines: KlineInput[] }
 */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { listAssetDbFiles } from "@/lib/db/path";
import path from "node:path";

interface KlineInput {
  token_id: string;
  slug: string;
  time_ms: number;
  price: number;
  volume: number;
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
    const db = new Database(targetDb);

    // 确保 klines 表存在（如果不存在则创建）
    db.exec(`
      CREATE TABLE IF NOT EXISTS klines (
        token_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        time_ms INTEGER NOT NULL,
        price REAL NOT NULL,
        volume REAL NOT NULL,
        PRIMARY KEY (token_id, time_ms)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS idx_klines_slug ON klines(slug);
    `);

    const insert = db.prepare(`
      INSERT OR REPLACE INTO klines (token_id, slug, time_ms, price, volume)
      VALUES (@token_id, @slug, @time_ms, @price, @volume)
    `);

    const insertMany = db.transaction((items: KlineInput[]) => {
      for (const k of items) {
        insert.run({
          token_id: k.token_id,
          slug: k.slug,
          time_ms: k.time_ms,
          price: k.price,
          volume: k.volume,
        });
      }
    });

    insertMany(klines);
    db.close();

    return NextResponse.json({ inserted: klines.length, asset, file: path.basename(targetDb) });
  } catch (err) {
    console.error("[sync/klines]", err);
    return NextResponse.json({ error: "Internal error", detail: String(err) }, { status: 500 });
  }
}

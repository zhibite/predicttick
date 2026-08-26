/**
 * Markets sync API - 批量写入/更新 markets
 * 使用 INSERT OR REPLACE 实现 upsert
 */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { marketsDbPath } from "@/lib/db/path";

interface MarketInput {
  slug: string;
  asset: string;
  period: string;
  start_epoch: number;
  up_token: string | null;
  down_token: string | null;
  end_epoch: number;
  status: string;
  volume: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const markets: MarketInput[] = Array.isArray(body.markets) ? body.markets : [];

    if (markets.length === 0) {
      return NextResponse.json({ inserted: 0 });
    }

    const db = new Database(marketsDbPath());
    db.pragma("journal_mode = WAL");

    // 确保表存在
    db.exec(`
      CREATE TABLE IF NOT EXISTS markets (
        slug TEXT PRIMARY KEY,
        asset TEXT NOT NULL,
        period TEXT NOT NULL,
        start_epoch INTEGER NOT NULL,
        up_token TEXT,
        down_token TEXT,
        end_epoch INTEGER NOT NULL,
        status TEXT NOT NULL,
        volume REAL NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_markets_asset_period ON markets(asset, period);
      CREATE INDEX IF NOT EXISTS idx_markets_start_epoch ON markets(start_epoch);
    `);

    const insert = db.prepare(`
      INSERT OR REPLACE INTO markets
        (slug, asset, period, start_epoch, up_token, down_token, end_epoch, status, volume)
      VALUES
        (@slug, @asset, @period, @start_epoch, @up_token, @down_token, @end_epoch, @status, @volume)
    `);

    const insertMany = db.transaction((items: MarketInput[]) => {
      for (const m of items) {
        insert.run({
          slug: m.slug,
          asset: m.asset,
          period: m.period,
          start_epoch: m.start_epoch,
          up_token: m.up_token,
          down_token: m.down_token,
          end_epoch: m.end_epoch,
          status: m.status,
          volume: m.volume,
        });
      }
    });

    insertMany(markets);
    db.close();

    return NextResponse.json({ inserted: markets.length });
  } catch (err) {
    console.error("[sync/markets]", err);
    return NextResponse.json({ error: "Internal error", detail: String(err) }, { status: 500 });
  }
}

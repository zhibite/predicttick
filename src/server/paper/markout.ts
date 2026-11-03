import { getDb } from "../db";
import { getAppDb } from "../app-db";

interface PendingTrade {
  id: string;
  slug: string;
  outcome: string;
  side: string;
  price: number;
  created_at: number;
  mid_at_fill: number | null;
  mid_1s: number | null;
  mid_10s: number | null;
  mid_60s: number | null;
  mid_end: number | null;
  market_end_at: number | null;
}

interface MarketRow {
  start_epoch: number;
  end_epoch: number;
  resolved: string;
}

interface Statements {
  before: ReturnType<ReturnType<typeof getDb>["prepare"]>;
  after: ReturnType<ReturnType<typeof getDb>["prepare"]>;
  market: ReturnType<ReturnType<typeof getDb>["prepare"]>;
}

let statementsCache: Statements | null = null;

function marketStatements(): Statements {
  if (!statementsCache) {
    const db = getDb();
    statementsCache = {
      before: db.prepare(
        `SELECT ts, up_mid, down_mid FROM samples
         WHERE slug = ? AND ts <= ? ORDER BY ts DESC LIMIT 1`,
      ),
      after: db.prepare(
        `SELECT ts, up_mid, down_mid FROM samples
         WHERE slug = ? AND ts >= ? ORDER BY ts ASC LIMIT 1`,
      ),
      market: db.prepare(
        `SELECT start_epoch, end_epoch, resolved FROM markets WHERE slug = ?`,
      ),
    };
  }
  return statementsCache;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sampleMid(
  row: Record<string, unknown> | undefined,
  outcome: string,
): number | null {
  if (!row) return null;
  return outcome === "DOWN" ? numOrNull(row.down_mid) : numOrNull(row.up_mid);
}

function findMid(
  slug: string,
  target: number,
  outcome: string,
  direction: "before" | "after",
  tolerance: number,
): number | null {
  const stmt =
    direction === "before"
      ? marketStatements().before
      : marketStatements().after;
  const row = stmt.get(slug, target) as unknown as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  const ts = Number(row.ts);
  if (Math.abs(ts - target) > tolerance) return null;
  return sampleMid(row, outcome);
}

function getMarket(slug: string): MarketRow | null {
  const row = marketStatements().market.get(slug) as unknown as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    start_epoch: Number(row.start_epoch),
    end_epoch: Number(row.end_epoch),
    resolved: String(row.resolved ?? "UNKNOWN"),
  };
}

/**
 * Fill-entry and post-fill markouts for paper trades.
 *
 * entry_edge = mid_at_fill - fill_price (BUY); positive means the fill was
 *             below the prevailing mid.
 * markout_h  = mid_(t+h) - mid_at_fill; positive means the mid moved in the
 *             position's favour after the fill.
 *
 * Returns the number of paper trades whose markout row was updated.
 */
export function updatePaperFillMarkouts(
  now = Math.floor(Date.now() / 1000),
): number {
  const db = getAppDb();
  const pending = db
    .prepare(
      `SELECT id, slug, outcome, side, price, created_at, mid_at_fill,
              mid_1s, mid_10s, mid_60s, mid_end, market_end_at
       FROM paper_trades
       WHERE markout_status IN ('PENDING', 'PARTIAL')
       ORDER BY created_at DESC LIMIT 500`,
    )
    .all() as unknown as PendingTrade[];

  if (pending.length === 0) return 0;

  const update = db.prepare(
    `UPDATE paper_trades SET
       mid_at_fill = COALESCE(?, mid_at_fill),
       mid_1s = COALESCE(?, mid_1s),
       mid_10s = COALESCE(?, mid_10s),
       mid_60s = COALESCE(?, mid_60s),
       mid_end = COALESCE(?, mid_end),
       entry_edge = COALESCE(?, entry_edge),
       markout_1s = COALESCE(?, markout_1s),
       markout_10s = COALESCE(?, markout_10s),
       markout_60s = COALESCE(?, markout_60s),
       markout_end = COALESCE(?, markout_end),
       market_end_at = COALESCE(?, market_end_at),
       markout_status = ?, markout_updated_at = ?
     WHERE id = ?`,
  );

  let updated = 0;
  const marketCache = new Map<string, MarketRow | null>();

  for (const trade of pending) {
    const sign = trade.side === "SELL" ? -1 : 1;
    let market: MarketRow | null;
    if (marketCache.has(trade.slug)) {
      market = marketCache.get(trade.slug) ?? null;
    } else {
      market = getMarket(trade.slug);
      marketCache.set(trade.slug, market);
    }
    const marketEnd = trade.market_end_at ?? market?.end_epoch ?? null;

    let midAtFill = trade.mid_at_fill;
    if (midAtFill == null) {
      midAtFill =
        findMid(trade.slug, trade.created_at, trade.outcome, "before", 10) ??
        findMid(trade.slug, trade.created_at, trade.outcome, "after", 10);
    }

    const horizon = (
      offset: number,
      current: number | null,
    ): number | null => {
      if (current != null) return current;
      if (marketEnd != null && trade.created_at + offset > marketEnd) {
        return null;
      }
      if (now < trade.created_at + offset) return null;
      return findMid(
        trade.slug,
        trade.created_at + offset,
        trade.outcome,
        "after",
        10,
      );
    };

    const mid1 = horizon(1, trade.mid_1s);
    const mid10 = horizon(10, trade.mid_10s);
    const mid60 = horizon(60, trade.mid_60s);

    let midEnd = trade.mid_end;
    if (midEnd == null && marketEnd != null && now >= marketEnd) {
      midEnd =
        findMid(trade.slug, marketEnd, trade.outcome, "before", 15) ??
        findMid(trade.slug, marketEnd, trade.outcome, "after", 5);
    }

    const entryEdge =
      midAtFill == null ? null : sign * (midAtFill - trade.price);
    const mo1 =
      midAtFill == null || mid1 == null
        ? null
        : sign * (mid1 - midAtFill);
    const mo10 =
      midAtFill == null || mid10 == null
        ? null
        : sign * (mid10 - midAtFill);
    const mo60 =
      midAtFill == null || mid60 == null
        ? null
        : sign * (mid60 - midAtFill);
    const moEnd =
      midAtFill == null || midEnd == null
        ? null
        : sign * (midEnd - midAtFill);

    const anyKnown =
      midAtFill != null ||
      mid1 != null ||
      mid10 != null ||
      mid60 != null ||
      midEnd != null;
    const stale =
      marketEnd != null ? now > marketEnd + 600 : now > trade.created_at + 3_600;
    const status =
      midEnd != null || stale
        ? "COMPLETE"
        : anyKnown
          ? "PARTIAL"
          : "PENDING";

    update.run(
      midAtFill,
      mid1,
      mid10,
      mid60,
      midEnd,
      entryEdge,
      mo1,
      mo10,
      mo60,
      moEnd,
      marketEnd,
      status,
      now,
      trade.id,
    );
    updated += 1;
  }

  return updated;
}

import { randomBytes } from "node:crypto";

import {
  PAPER_ASSETS,
  PAPER_PERIODS,
  PAPER_WINDOWS,
  defaultPaperConfig,
} from "@/lib/paper-defaults";
import { getAppDb } from "../app-db";
import type {
  PaperEquityRow,
  PaperPositionRow,
  PaperSettlementRow,
  PaperStrategyConfig,
  PaperStrategyDetail,
  PaperStrategyKind,
  PaperStrategyRow,
  PaperStrategySummary,
  PaperTradeRow,
} from "./types";

function clamp(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function pickNumber(
  raw: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = raw[key];
  return clamp(
    typeof value === "number" ? value : Number(value),
    fallback,
    min,
    max,
  );
}

export function normalizePaperConfig(
  kind: PaperStrategyKind,
  raw: unknown,
): PaperStrategyConfig {
  const base = defaultPaperConfig(kind);
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const config: PaperStrategyConfig = {
    ...base,
    feeRate: pickNumber(input, "feeRate", base.feeRate ?? 0, 0, 0.1),
    makerRebateBps: pickNumber(
      input,
      "makerRebateBps",
      base.makerRebateBps ?? 0,
      0,
      1_000,
    ),
    slippageBps: pickNumber(
      input,
      "slippageBps",
      base.slippageBps ?? 0,
      0,
      500,
    ),
    maxCostPerMarket: pickNumber(
      input,
      "maxCostPerMarket",
      base.maxCostPerMarket ?? 100,
      1,
      10_000_000,
    ),
    maxOpenCost: pickNumber(
      input,
      "maxOpenCost",
      base.maxOpenCost ?? 1_000,
      1,
      10_000_000,
    ),
    minSecondsBetweenEntries: pickNumber(
      input,
      "minSecondsBetweenEntries",
      base.minSecondsBetweenEntries ?? 0,
      0,
      86_400,
    ),
    maxSampleAgeSeconds: pickNumber(
      input,
      "maxSampleAgeSeconds",
      base.maxSampleAgeSeconds ?? 10,
      1,
      300,
    ),
    minEdge: pickNumber(input, "minEdge", base.minEdge ?? 0.005, 0, 0.5),
  };

  if (kind === "pair_lock") {
    config.pairNotional = pickNumber(
      input,
      "pairNotional",
      base.pairNotional ?? 25,
      1,
      1_000_000,
    );
  } else {
    config.sizeUsd = pickNumber(
      input,
      "sizeUsd",
      base.sizeUsd ?? 5,
      1,
      1_000_000,
    );
    const minPrice = pickNumber(
      input,
      "minPrice",
      base.minPrice ?? 0.3,
      0.01,
      0.99,
    );
    const maxPrice = clamp(
      typeof input.maxPrice === "number"
        ? input.maxPrice
        : Number(input.maxPrice),
      base.maxPrice ?? 0.9,
      minPrice + 0.01,
      0.99,
    );
    config.minPrice = minPrice;
    config.maxPrice = maxPrice;
    if (Array.isArray(input.allowedWindows)) {
      const windows = input.allowedWindows.filter(
        (value): value is string =>
          typeof value === "string" && PAPER_WINDOWS.includes(value),
      );
      config.allowedWindows = windows;
    } else {
      config.allowedWindows = base.allowedWindows;
    }
  }

  return config;
}

function mapStrategy(row: Record<string, unknown>): PaperStrategyRow {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    kind: String(row.kind ?? "pair_lock") as PaperStrategyKind,
    asset: String(row.asset ?? "btc"),
    period: String(row.period ?? "5m"),
    config_json: String(row.config_json ?? "{}"),
    active: Number(row.active ?? 0),
    starting_balance: Number(row.starting_balance ?? 0),
    cash: Number(row.cash ?? 0),
    realized_pnl: Number(row.realized_pnl ?? 0),
    fees_paid: Number(row.fees_paid ?? 0),
    last_tick_at:
      row.last_tick_at == null ? null : Number(row.last_tick_at),
    last_error: typeof row.last_error === "string" ? row.last_error : null,
    created_by: typeof row.created_by === "string" ? row.created_by : null,
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

function mapPosition(row: Record<string, unknown>): PaperPositionRow {
  return {
    id: String(row.id ?? ""),
    strategy_id: String(row.strategy_id ?? ""),
    slug: String(row.slug ?? ""),
    asset: String(row.asset ?? ""),
    period: String(row.period ?? ""),
    title: typeof row.title === "string" ? row.title : null,
    outcome: String(row.outcome ?? ""),
    shares: Number(row.shares ?? 0),
    cost: Number(row.cost ?? 0),
    fees: Number(row.fees ?? 0),
    avg_price: Number(row.avg_price ?? 0),
    last_price: row.last_price == null ? null : Number(row.last_price),
    last_value: row.last_value == null ? null : Number(row.last_value),
    opened_at: Number(row.opened_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
    status: String(row.status ?? "OPEN"),
    settled_at: row.settled_at == null ? null : Number(row.settled_at),
    settlement_price:
      row.settlement_price == null ? null : Number(row.settlement_price),
    realized_pnl:
      row.realized_pnl == null ? null : Number(row.realized_pnl),
  };
}

function mapTrade(row: Record<string, unknown>): PaperTradeRow {
  return {
    id: String(row.id ?? ""),
    strategy_id: String(row.strategy_id ?? ""),
    slug: String(row.slug ?? ""),
    asset: String(row.asset ?? ""),
    period: String(row.period ?? ""),
    title: typeof row.title === "string" ? row.title : null,
    outcome: String(row.outcome ?? ""),
    side: String(row.side ?? ""),
    price: Number(row.price ?? 0),
    shares: Number(row.shares ?? 0),
    notional: Number(row.notional ?? 0),
    fee: Number(row.fee ?? 0),
    reason: typeof row.reason === "string" ? row.reason : null,
    signal_json:
      typeof row.signal_json === "string" ? row.signal_json : null,
    created_at: Number(row.created_at ?? 0),
    mid_at_fill:
      row.mid_at_fill == null ? null : Number(row.mid_at_fill),
    mid_1s: row.mid_1s == null ? null : Number(row.mid_1s),
    mid_10s: row.mid_10s == null ? null : Number(row.mid_10s),
    mid_60s: row.mid_60s == null ? null : Number(row.mid_60s),
    mid_end: row.mid_end == null ? null : Number(row.mid_end),
    entry_edge:
      row.entry_edge == null ? null : Number(row.entry_edge),
    markout_1s:
      row.markout_1s == null ? null : Number(row.markout_1s),
    markout_10s:
      row.markout_10s == null ? null : Number(row.markout_10s),
    markout_60s:
      row.markout_60s == null ? null : Number(row.markout_60s),
    markout_end:
      row.markout_end == null ? null : Number(row.markout_end),
    market_end_at:
      row.market_end_at == null ? null : Number(row.market_end_at),
    markout_status: String(row.markout_status ?? "PENDING"),
    markout_updated_at:
      row.markout_updated_at == null
        ? null
        : Number(row.markout_updated_at),
  };
}

function mapSettlement(row: Record<string, unknown>): PaperSettlementRow {
  return {
    id: String(row.id ?? ""),
    strategy_id: String(row.strategy_id ?? ""),
    position_id: String(row.position_id ?? ""),
    slug: String(row.slug ?? ""),
    title: typeof row.title === "string" ? row.title : null,
    outcome: String(row.outcome ?? ""),
    shares: Number(row.shares ?? 0),
    payout: Number(row.payout ?? 0),
    cost: Number(row.cost ?? 0),
    fees: Number(row.fees ?? 0),
    pnl: Number(row.pnl ?? 0),
    created_at: Number(row.created_at ?? 0),
  };
}

function mapEquity(row: Record<string, unknown>): PaperEquityRow {
  return {
    strategy_id: String(row.strategy_id ?? ""),
    ts: Number(row.ts ?? 0),
    cash: Number(row.cash ?? 0),
    positions_value: Number(row.positions_value ?? 0),
    equity: Number(row.equity ?? 0),
    realized_pnl: Number(row.realized_pnl ?? 0),
    unrealized_pnl: Number(row.unrealized_pnl ?? 0),
  };
}

function summarize(row: PaperStrategyRow): PaperStrategySummary {
  const db = getAppDb();
  const open = db
    .prepare(
      `SELECT COALESCE(SUM(COALESCE(last_value, cost)), 0) AS value,
              COUNT(*) AS n
       FROM paper_positions
       WHERE strategy_id = ? AND status = 'OPEN'`,
    )
    .get(row.id) as unknown as { value: number; n: number };
  const trades = db
    .prepare("SELECT COUNT(*) AS n FROM paper_trades WHERE strategy_id = ?")
    .get(row.id) as unknown as { n: number };
  const settlements = db
    .prepare(
      "SELECT COUNT(*) AS n FROM paper_settlements WHERE strategy_id = ?",
    )
    .get(row.id) as unknown as { n: number };

  const positionsValue = Number(open.value);
  const equity = row.cash + positionsValue;
  return {
    ...row,
    equity,
    positions_value: positionsValue,
    open_positions: Number(open.n),
    trade_count: Number(trades.n),
    settlement_count: Number(settlements.n),
    return_pct:
      row.starting_balance > 0
        ? ((equity - row.starting_balance) / row.starting_balance) * 100
        : 0,
  };
}

export function listPaperStrategies(): PaperStrategySummary[] {
  const rows = getAppDb()
    .prepare("SELECT * FROM paper_strategies ORDER BY created_at ASC")
    .all() as unknown as Record<string, unknown>[];
  return rows.map(mapStrategy).map(summarize);
}

export function getPaperStrategy(id: string): PaperStrategyRow | null {
  const row = getAppDb()
    .prepare("SELECT * FROM paper_strategies WHERE id = ?")
    .get(id) as unknown as Record<string, unknown> | undefined;
  return row ? mapStrategy(row) : null;
}

export function getPaperStrategySummary(
  id: string,
): PaperStrategySummary | null {
  const row = getPaperStrategy(id);
  return row ? summarize(row) : null;
}

export function getPaperPositions(
  strategyId: string,
  limit = 200,
): PaperPositionRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM paper_positions WHERE strategy_id = ?
       ORDER BY CASE status WHEN 'OPEN' THEN 0 ELSE 1 END,
                opened_at DESC LIMIT ?`,
    )
    .all(strategyId, limit) as unknown as Record<string, unknown>[];
  return rows.map(mapPosition);
}

export function getOpenPaperPositions(
  strategyId: string,
): PaperPositionRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM paper_positions
       WHERE strategy_id = ? AND status = 'OPEN'
       ORDER BY opened_at ASC`,
    )
    .all(strategyId) as unknown as Record<string, unknown>[];
  return rows.map(mapPosition);
}

export function getPaperTrades(
  strategyId: string,
  limit = 200,
): PaperTradeRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM paper_trades WHERE strategy_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(strategyId, limit) as unknown as Record<string, unknown>[];
  return rows.map(mapTrade);
}

export function getPaperSettlements(
  strategyId: string,
  limit = 200,
): PaperSettlementRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM paper_settlements WHERE strategy_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(strategyId, limit) as unknown as Record<string, unknown>[];
  return rows.map(mapSettlement);
}

export function getPaperEquity(
  strategyId: string,
  limit = 500,
): PaperEquityRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM paper_equity WHERE strategy_id = ?
       ORDER BY ts DESC LIMIT ?`,
    )
    .all(strategyId, limit) as unknown as Record<string, unknown>[];
  return rows.map(mapEquity).reverse();
}

export function getPaperStrategyDetail(
  id: string,
): PaperStrategyDetail | null {
  const strategy = getPaperStrategySummary(id);
  if (!strategy) return null;
  return {
    strategy,
    positions: getPaperPositions(id),
    trades: getPaperTrades(id),
    settlements: getPaperSettlements(id),
    equity: getPaperEquity(id),
  };
}

export interface CreatePaperStrategyInput {
  name: string;
  kind: PaperStrategyKind;
  asset?: string;
  period?: string;
  startingBalance?: number;
  config?: unknown;
  createdBy?: string | null;
}

export type CreatePaperStrategyResult =
  | { strategy: PaperStrategySummary }
  | { error: string };

export function createPaperStrategy(
  input: CreatePaperStrategyInput,
): CreatePaperStrategyResult {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    return { error: "Name must be 1-80 characters." };
  }
  if (input.kind !== "pair_lock" && input.kind !== "mid_maker") {
    return { error: "Unknown strategy kind." };
  }
  const asset = input.asset ?? "btc";
  if (!PAPER_ASSETS.includes(asset)) {
    return { error: "Unsupported asset." };
  }
  const period = input.period ?? "5m";
  if (!PAPER_PERIODS.includes(period)) {
    return { error: "Unsupported period." };
  }
  const startingBalance = clamp(
    input.startingBalance,
    1_000,
    10,
    10_000_000,
  );
  const config = normalizePaperConfig(input.kind, input.config);
  const now = Math.floor(Date.now() / 1000);
  const id = `paper_${randomBytes(12).toString("hex")}`;

  getAppDb()
    .prepare(
      `INSERT INTO paper_strategies
         (id, name, kind, asset, period, config_json, active,
          starting_balance, cash, realized_pnl, fees_paid, created_by,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 0, ?, ?, ?)`,
    )
    .run(
      id,
      name,
      input.kind,
      asset,
      period,
      JSON.stringify(config),
      startingBalance,
      startingBalance,
      input.createdBy ?? null,
      now,
      now,
    );

  return { strategy: getPaperStrategySummary(id)! };
}

export interface UpdatePaperStrategyInput {
  name?: string;
  active?: boolean;
  config?: unknown;
}

export function updatePaperStrategy(
  id: string,
  input: UpdatePaperStrategyInput,
): PaperStrategySummary | null {
  const row = getPaperStrategy(id);
  if (!row) return null;
  const sets: string[] = [];
  const values: Array<string | number | null> = [];

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 1 || name.length > 80) return null;
    sets.push("name = ?");
    values.push(name);
  }
  if (input.active !== undefined) {
    sets.push("active = ?");
    values.push(input.active ? 1 : 0);
  }
  if (input.config !== undefined) {
    sets.push("config_json = ?");
    values.push(JSON.stringify(normalizePaperConfig(row.kind, input.config)));
  }
  if (sets.length === 0) return summarize(row);

  sets.push("updated_at = ?");
  values.push(Math.floor(Date.now() / 1000));
  getAppDb()
    .prepare(`UPDATE paper_strategies SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values, id);
  return getPaperStrategySummary(id);
}

export function setPaperStrategyActive(
  id: string,
  active: boolean,
): PaperStrategySummary | null {
  return updatePaperStrategy(id, { active });
}

export function updatePaperStrategyTick(
  id: string,
  lastTickAt: number,
  lastError: string | null,
): void {
  getAppDb()
    .prepare(
      `UPDATE paper_strategies
       SET last_tick_at = ?, last_error = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(lastTickAt, lastError, Math.floor(Date.now() / 1000), id);
}

export function resetPaperStrategy(
  id: string,
): PaperStrategySummary | null {
  const row = getPaperStrategy(id);
  if (!row) return null;
  const db = getAppDb();
  const now = Math.floor(Date.now() / 1000);

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM paper_positions WHERE strategy_id = ?").run(id);
    db.prepare("DELETE FROM paper_trades WHERE strategy_id = ?").run(id);
    db.prepare("DELETE FROM paper_settlements WHERE strategy_id = ?").run(id);
    db.prepare("DELETE FROM paper_equity WHERE strategy_id = ?").run(id);
    db.prepare(
      `UPDATE paper_strategies
       SET active = 0, cash = starting_balance, realized_pnl = 0,
           fees_paid = 0, last_tick_at = NULL, last_error = NULL,
           updated_at = ?
       WHERE id = ?`,
    ).run(now, id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getPaperStrategySummary(id);
}

export function deletePaperStrategy(id: string): boolean {
  const db = getAppDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM paper_positions WHERE strategy_id = ?").run(id);
    db.prepare("DELETE FROM paper_trades WHERE strategy_id = ?").run(id);
    db.prepare("DELETE FROM paper_settlements WHERE strategy_id = ?").run(id);
    db.prepare("DELETE FROM paper_equity WHERE strategy_id = ?").run(id);
    const result = db
      .prepare("DELETE FROM paper_strategies WHERE id = ?")
      .run(id);
    db.exec("COMMIT");
    return Number(result.changes) > 0;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function hasPaperMarketActivity(
  strategyId: string,
  slug: string,
): boolean {
  const row = getAppDb()
    .prepare(
      `SELECT 1 AS found FROM paper_positions
       WHERE strategy_id = ? AND slug = ? LIMIT 1`,
    )
    .get(strategyId, slug) as unknown as { found: number } | undefined;
  return row != null;
}

export function getPaperMarketCost(
  strategyId: string,
  slug: string,
): number {
  const row = getAppDb()
    .prepare(
      `SELECT COALESCE(SUM(cost), 0) AS value FROM paper_positions
       WHERE strategy_id = ? AND slug = ? AND status = 'OPEN'`,
    )
    .get(strategyId, slug) as unknown as { value: number };
  return Number(row.value);
}

export function getPaperOpenCost(strategyId: string): number {
  const row = getAppDb()
    .prepare(
      `SELECT COALESCE(SUM(cost), 0) AS value FROM paper_positions
       WHERE strategy_id = ? AND status = 'OPEN'`,
    )
    .get(strategyId) as unknown as { value: number };
  return Number(row.value);
}

export function getLastPaperEntryAt(
  strategyId: string,
  slug: string,
  outcome: string,
): number | null {
  const row = getAppDb()
    .prepare(
      `SELECT MAX(created_at) AS ts FROM paper_trades
       WHERE strategy_id = ? AND slug = ? AND outcome = ?`,
    )
    .get(strategyId, slug, outcome) as unknown as { ts: number | null };
  return row.ts == null ? null : Number(row.ts);
}

export function recordPaperBuy(input: {
  strategyId: string;
  slug: string;
  asset: string;
  period: string;
  title: string | null;
  outcome: string;
  price: number;
  shares: number;
  fee: number;
  reason: string;
  signal: unknown;
  midAtFill: number | null;
  marketEndAt: number | null;
  now: number;
}): void {
  const db = getAppDb();
  const notional = input.price * input.shares;
  const tradeId = `ptr_${randomBytes(12).toString("hex")}`;
  const entryEdge =
    input.midAtFill == null ? null : input.midAtFill - input.price;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO paper_trades
         (id, strategy_id, slug, asset, period, title, outcome, side,
          price, shares, notional, fee, reason, signal_json, created_at,
          mid_at_fill, entry_edge, market_end_at, markout_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'BUY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    ).run(
      tradeId,
      input.strategyId,
      input.slug,
      input.asset,
      input.period,
      input.title,
      input.outcome,
      input.price,
      input.shares,
      notional,
      input.fee,
      input.reason,
      JSON.stringify(input.signal),
      input.now,
      input.midAtFill,
      entryEdge,
      input.marketEndAt,
    );

    const existing = db
      .prepare(
        `SELECT * FROM paper_positions
         WHERE strategy_id = ? AND slug = ? AND outcome = ? AND status = 'OPEN'`,
      )
      .get(input.strategyId, input.slug, input.outcome) as unknown as
      | Record<string, unknown>
      | undefined;

    if (existing) {
      const shares = Number(existing.shares) + input.shares;
      const cost = Number(existing.cost) + notional;
      const fees = Number(existing.fees) + input.fee;
      db.prepare(
        `UPDATE paper_positions SET shares = ?, cost = ?, fees = ?,
           avg_price = ?, last_price = ?, last_value = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        shares,
        cost,
        fees,
        cost / shares,
        input.price,
        input.price * shares,
        input.now,
        String(existing.id),
      );
    } else {
      db.prepare(
        `INSERT INTO paper_positions
           (id, strategy_id, slug, asset, period, title, outcome, shares,
            cost, fees, avg_price, last_price, last_value, opened_at,
            updated_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
      ).run(
        `ppo_${randomBytes(12).toString("hex")}`,
        input.strategyId,
        input.slug,
        input.asset,
        input.period,
        input.title,
        input.outcome,
        input.shares,
        notional,
        input.fee,
        input.price,
        input.price,
        notional,
        input.now,
        input.now,
      );
    }

    db.prepare(
      `UPDATE paper_strategies
       SET cash = cash - ? - ?, fees_paid = fees_paid + ?, updated_at = ?
       WHERE id = ?`,
    ).run(notional, input.fee, input.fee, input.now, input.strategyId);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function settlePaperPosition(input: {
  strategyId: string;
  positionId: string;
  payout: number;
  settlementPrice: number;
  now: number;
}): PaperSettlementRow | null {
  const db = getAppDb();
  const position = db
    .prepare(
      `SELECT * FROM paper_positions
       WHERE id = ? AND strategy_id = ? AND status = 'OPEN'`,
    )
    .get(input.positionId, input.strategyId) as unknown as
    | Record<string, unknown>
    | undefined;
  if (!position) return null;

  const pnl =
    input.payout - Number(position.cost) - Number(position.fees);
  const settlementId = `pst_${randomBytes(12).toString("hex")}`;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO paper_settlements
         (id, strategy_id, position_id, slug, title, outcome, shares,
          payout, cost, fees, pnl, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      settlementId,
      input.strategyId,
      input.positionId,
      String(position.slug),
      typeof position.title === "string" ? position.title : null,
      String(position.outcome),
      Number(position.shares),
      input.payout,
      Number(position.cost),
      Number(position.fees),
      pnl,
      input.now,
    );

    db.prepare(
      `UPDATE paper_positions
       SET status = 'SETTLED', settled_at = ?, settlement_price = ?,
           realized_pnl = ?, last_price = ?, last_value = 0, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.now,
      input.settlementPrice,
      pnl,
      input.settlementPrice,
      input.now,
      input.positionId,
    );

    db.prepare(
      `UPDATE paper_strategies
       SET cash = cash + ?, realized_pnl = realized_pnl + ?, updated_at = ?
       WHERE id = ?`,
    ).run(input.payout, pnl, input.now, input.strategyId);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const saved = db
    .prepare("SELECT * FROM paper_settlements WHERE id = ?")
    .get(settlementId) as unknown as Record<string, unknown> | undefined;
  return saved ? mapSettlement(saved) : null;
}

export function markPaperPosition(
  positionId: string,
  price: number,
  value: number,
  now: number,
): void {
  getAppDb()
    .prepare(
      `UPDATE paper_positions
       SET last_price = ?, last_value = ?, updated_at = ?
       WHERE id = ? AND status = 'OPEN'`,
    )
    .run(price, value, now, positionId);
}

export function sumOpenPaperPositionCost(strategyId: string): number {
  return getPaperOpenCost(strategyId);
}

export function recordPaperEquity(input: {
  strategyId: string;
  ts: number;
  cash: number;
  positionsValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  equity: number;
}): void {
  getAppDb()
    .prepare(
      `INSERT OR REPLACE INTO paper_equity
         (strategy_id, ts, cash, positions_value, equity, realized_pnl,
          unrealized_pnl)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.strategyId,
      input.ts,
      input.cash,
      input.positionsValue,
      input.equity,
      input.realizedPnl,
      input.unrealizedPnl,
    );
}

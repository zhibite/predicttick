import { randomBytes } from "node:crypto";

import { getAppDb } from "../app-db";
import { normalizeTraderAddress } from "../leaderboard/store";
import type {
  ResearchRunDetail,
  ResearchRunRow,
  ResearchStatus,
  ResearchSummary,
  ResearchTradeInput,
  ResearchTradeRow,
} from "./types";

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mapRun(row: Record<string, unknown>): ResearchRunRow {
  return {
    id: String(row.id ?? ""),
    address: String(row.address ?? ""),
    status: String(row.status ?? "QUEUED") as ResearchStatus,
    max_trades: Number(row.max_trades ?? 0),
    created_by: stringOrNull(row.created_by),
    created_at: Number(row.created_at ?? 0),
    started_at: numOrNull(row.started_at),
    finished_at: numOrNull(row.finished_at),
    progress_trades: Number(row.progress_trades ?? 0),
    enriched_trades: Number(row.enriched_trades ?? 0),
    total_expected: numOrNull(row.total_expected),
    truncated: Number(row.truncated ?? 0),
    error: stringOrNull(row.error),
    summary_json: stringOrNull(row.summary_json),
  };
}

function mapTrade(row: Record<string, unknown>): ResearchTradeRow {
  return {
    run_id: String(row.run_id ?? ""),
    id: String(row.id ?? ""),
    slug: String(row.slug ?? ""),
    title: stringOrNull(row.title),
    condition_id: stringOrNull(row.condition_id),
    outcome: stringOrNull(row.outcome),
    side: stringOrNull(row.side),
    price: Number(row.price ?? 0),
    size: Number(row.size ?? 0),
    usdc_size: Number(row.usdc_size ?? 0),
    trade_ts: Number(row.trade_ts ?? 0),
    market_start: numOrNull(row.market_start),
    market_end: numOrNull(row.market_end),
    resolved: stringOrNull(row.resolved),
    elapsed: numOrNull(row.elapsed),
    mid_at_fill: numOrNull(row.mid_at_fill),
    mid_1s: numOrNull(row.mid_1s),
    mid_10s: numOrNull(row.mid_10s),
    mid_60s: numOrNull(row.mid_60s),
    mid_end: numOrNull(row.mid_end),
    entry_edge: numOrNull(row.entry_edge),
    markout_1s: numOrNull(row.markout_1s),
    markout_10s: numOrNull(row.markout_10s),
    markout_60s: numOrNull(row.markout_60s),
    markout_end: numOrNull(row.markout_end),
  };
}

export type CreateResearchResult =
  | { run: ResearchRunRow }
  | { error: string };

export function createResearchRun(input: {
  address: string;
  maxTrades?: number;
  createdBy?: string | null;
}): CreateResearchResult {
  const address = normalizeTraderAddress(input.address);
  if (!address) return { error: "Enter a valid wallet address." };

  const maxTrades = Number.isFinite(input.maxTrades)
    ? Math.min(1_000_000, Math.max(0, Math.floor(input.maxTrades!)))
    : 20_000;
  const now = Math.floor(Date.now() / 1000);
  const id = `res_${randomBytes(12).toString("hex")}`;

  getAppDb()
    .prepare(
      `INSERT INTO trader_research_runs
         (id, address, status, max_trades, created_by, created_at,
          progress_trades, enriched_trades, truncated)
       VALUES (?, ?, 'QUEUED', ?, ?, ?, 0, 0, 0)`,
    )
    .run(id, address, maxTrades, input.createdBy ?? null, now);

  return { run: getResearchRun(id)! };
}

export function listResearchRuns(limit = 20): ResearchRunRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM trader_research_runs
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as unknown as Record<string, unknown>[];
  return rows.map(mapRun);
}

export function getResearchRun(id: string): ResearchRunRow | null {
  const row = getAppDb()
    .prepare("SELECT * FROM trader_research_runs WHERE id = ?")
    .get(id) as unknown as Record<string, unknown> | undefined;
  return row ? mapRun(row) : null;
}

export function claimNextResearchRun(): ResearchRunRow | null {
  const db = getAppDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db
      .prepare(
        `SELECT * FROM trader_research_runs
         WHERE status = 'QUEUED'
         ORDER BY created_at ASC LIMIT 1`,
      )
      .get() as unknown as Record<string, unknown> | undefined;
    if (!row) {
      db.exec("COMMIT");
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `UPDATE trader_research_runs
       SET status = 'FETCHING', started_at = ?, error = NULL
       WHERE id = ?`,
    ).run(now, String(row.id));
    db.exec("COMMIT");
    return { ...mapRun(row), status: "FETCHING", started_at: now };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export interface ResearchRunPatch {
  status?: ResearchStatus;
  progressTrades?: number;
  enrichedTrades?: number;
  totalExpected?: number | null;
  truncated?: boolean;
  error?: string | null;
  summaryJson?: string | null;
  finishedAt?: number | null;
}

export function updateResearchRun(
  id: string,
  patch: ResearchRunPatch,
): void {
  const sets: string[] = [];
  const values: Array<string | number | null> = [];
  if (patch.status !== undefined) {
    sets.push("status = ?");
    values.push(patch.status);
  }
  if (patch.progressTrades !== undefined) {
    sets.push("progress_trades = ?");
    values.push(patch.progressTrades);
  }
  if (patch.enrichedTrades !== undefined) {
    sets.push("enriched_trades = ?");
    values.push(patch.enrichedTrades);
  }
  if (patch.totalExpected !== undefined) {
    sets.push("total_expected = ?");
    values.push(patch.totalExpected);
  }
  if (patch.truncated !== undefined) {
    sets.push("truncated = ?");
    values.push(patch.truncated ? 1 : 0);
  }
  if (patch.error !== undefined) {
    sets.push("error = ?");
    values.push(patch.error);
  }
  if (patch.summaryJson !== undefined) {
    sets.push("summary_json = ?");
    values.push(patch.summaryJson);
  }
  if (patch.finishedAt !== undefined) {
    sets.push("finished_at = ?");
    values.push(patch.finishedAt);
  }
  if (sets.length === 0) return;
  getAppDb()
    .prepare(
      `UPDATE trader_research_runs SET ${sets.join(", ")} WHERE id = ?`,
    )
    .run(...values, id);
}

export function insertResearchTrades(
  runId: string,
  trades: ResearchTradeInput[],
): void {
  if (trades.length === 0) return;
  const db = getAppDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const insert = db.prepare(
      `INSERT OR REPLACE INTO trader_research_trades
         (run_id, id, slug, condition_id, outcome, side, price, size,
          usdc_size, trade_ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const trade of trades) {
      insert.run(
        runId,
        trade.id,
        trade.slug,
        trade.condition_id,
        trade.outcome,
        trade.side,
        trade.price,
        trade.size,
        trade.usdc_size,
        trade.trade_ts,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listResearchSlugs(runId: string): string[] {
  const rows = getAppDb()
    .prepare(
      `SELECT slug FROM trader_research_trades
       WHERE run_id = ? GROUP BY slug ORDER BY slug`,
    )
    .all(runId) as unknown as Array<{ slug: string }>;
  return rows.map((row) => row.slug);
}

export function getResearchTradesForSlug(
  runId: string,
  slug: string,
): ResearchTradeRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM trader_research_trades
       WHERE run_id = ? AND slug = ? ORDER BY trade_ts ASC`,
    )
    .all(runId, slug) as unknown as Record<string, unknown>[];
  return rows.map(mapTrade);
}

export function updateResearchTradeEnrichment(input: {
  runId: string;
  id: string;
  title: string | null;
  marketStart: number | null;
  marketEnd: number | null;
  resolved: string | null;
  elapsed: number | null;
  midAtFill: number | null;
  mid1s: number | null;
  mid10s: number | null;
  mid60s: number | null;
  midEnd: number | null;
  entryEdge: number | null;
  markout1s: number | null;
  markout10s: number | null;
  markout60s: number | null;
  markoutEnd: number | null;
}): void {
  getAppDb()
    .prepare(
      `UPDATE trader_research_trades SET
         title = COALESCE(?, title),
         market_start = COALESCE(?, market_start),
         market_end = COALESCE(?, market_end),
         resolved = COALESCE(?, resolved),
         elapsed = COALESCE(?, elapsed),
         mid_at_fill = COALESCE(?, mid_at_fill),
         mid_1s = COALESCE(?, mid_1s),
         mid_10s = COALESCE(?, mid_10s),
         mid_60s = COALESCE(?, mid_60s),
         mid_end = COALESCE(?, mid_end),
         entry_edge = COALESCE(?, entry_edge),
         markout_1s = COALESCE(?, markout_1s),
         markout_10s = COALESCE(?, markout_10s),
         markout_60s = COALESCE(?, markout_60s),
         markout_end = COALESCE(?, markout_end)
       WHERE run_id = ? AND id = ?`,
    )
    .run(
      input.title,
      input.marketStart,
      input.marketEnd,
      input.resolved,
      input.elapsed,
      input.midAtFill,
      input.mid1s,
      input.mid10s,
      input.mid60s,
      input.midEnd,
      input.entryEdge,
      input.markout1s,
      input.markout10s,
      input.markout60s,
      input.markoutEnd,
      input.runId,
      input.id,
    );
}

export function getResearchTradeChunk(
  runId: string,
  afterId: string,
  limit = 5_000,
): ResearchTradeRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM trader_research_trades
       WHERE run_id = ? AND id > ?
       ORDER BY id ASC LIMIT ?`,
    )
    .all(runId, afterId, limit) as unknown as Record<string, unknown>[];
  return rows.map(mapTrade);
}

export function getRecentResearchTrades(
  runId: string,
  limit = 500,
): ResearchTradeRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM trader_research_trades
       WHERE run_id = ? ORDER BY trade_ts DESC LIMIT ?`,
    )
    .all(runId, limit) as unknown as Record<string, unknown>[];
  return rows.map(mapTrade);
}

export function countResearchTrades(runId: string): number {
  const row = getAppDb()
    .prepare(
      "SELECT COUNT(*) AS c FROM trader_research_trades WHERE run_id = ?",
    )
    .get(runId) as unknown as { c: number };
  return Number(row.c);
}

export function getResearchRunDetail(
  id: string,
): ResearchRunDetail | null {
  const run = getResearchRun(id);
  if (!run) return null;
  let summary: ResearchSummary | null = null;
  if (run.summary_json) {
    try {
      summary = JSON.parse(run.summary_json) as ResearchSummary;
    } catch {
      summary = null;
    }
  }
  return {
    run,
    summary,
    trades: getRecentResearchTrades(id),
  };
}

export function deleteResearchRun(id: string): boolean {
  const db = getAppDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM trader_research_trades WHERE run_id = ?").run(id);
    const result = db
      .prepare("DELETE FROM trader_research_runs WHERE id = ?")
      .run(id);
    db.exec("COMMIT");
    return Number(result.changes) > 0;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Mark interrupted in-flight runs as failed on process startup. */
export function resetStaleResearchRuns(): void {
  getAppDb()
    .prepare(
      `UPDATE trader_research_runs
       SET status = 'ERROR',
           error = 'Interrupted by server restart. Start a new run.',
           finished_at = ?
       WHERE status IN ('FETCHING', 'ENRICHING')`,
    )
    .run(Math.floor(Date.now() / 1000));
}

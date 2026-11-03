import { createHash, randomUUID } from "node:crypto";

import { getAppDb } from "@/server/app-db";
import type { CurrentUser } from "@/server/user-types";
import { getEntitlements } from "@/server/entitlements";
import { addBacktestRun, addBacktestWindows, getUsage } from "@/server/usage";

import { ENGINE_VERSION } from "./engine";
import type {
  BacktestConfig,
  BacktestSummary,
  BacktestTrade,
} from "./engine";

export interface StrategyRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source: string;
  source_hash: string;
  params_json: string;
  version: number;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
}

export interface RunRow {
  id: string;
  user_id: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  status: string;
  progress: number;
  strategy_id: string | null;
  strategy_version: number | null;
  source_hash: string;
  config_json: string;
  summary_json: string | null;
  engine_version: string;
  data_cutoff: number | null;
  error: string | null;
  trial: number;
  mode: string | null;
  sweep_id: string | null;
  sweep_index: number | null;
  cancel_requested: number;
}

export interface RunPublic {
  id: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  status: string;
  progress: number;
  strategy_id: string | null;
  strategy_version: number | null;
  trial: boolean;
  mode: string | null;
  error: string | null;
  summary: BacktestSummary | null;
}

export interface RunDetail extends RunPublic {
  trades: BacktestTrade[];
}

export interface SweepRow {
  id: string;
  user_id: string;
  created_at: number;
  finished_at: number | null;
  status: string;
  config_json: string;
  total_runs: number;
  completed_runs: number;
  summary_json: string | null;
  error: string | null;
}

export interface SweepRun {
  id: string;
  sweep_index: number | null;
  status: string;
  params: Record<string, unknown>;
  trades: number | null;
  pnl: number | null;
  winRate: number | null;
  roi: number | null;
  error: string | null;
}

export interface SweepDetail extends SweepRow {
  runs: SweepRun[];
}

function hashSource(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function parseSummary(raw: string | null): BacktestSummary | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BacktestSummary;
  } catch {
    return null;
  }
}

export function listStrategies(userId: string): StrategyRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT id, user_id, name, description, source, source_hash,
              params_json, version, created_at, updated_at, archived_at
       FROM strategies
       WHERE user_id = ? AND archived_at IS NULL
       ORDER BY updated_at DESC`,
    )
    .all(userId) as unknown as StrategyRow[];
  return rows.map((row) => ({ ...row }));
}

export function getStrategy(userId: string, id: string): StrategyRow | null {
  const row = getAppDb()
    .prepare(
      `SELECT id, user_id, name, description, source, source_hash,
              params_json, version, created_at, updated_at, archived_at
       FROM strategies
       WHERE id = ? AND user_id = ? AND archived_at IS NULL`,
    )
    .get(id, userId) as unknown as StrategyRow | undefined;
  return row ? { ...row } : null;
}

type StrategyError = "NOT_PAID" | "LIMIT";

export function createStrategy(
  user: CurrentUser,
  name: string,
  source: string,
  paramsJson: string,
  description?: string,
): { strategy?: StrategyRow; error?: StrategyError } {
  const entitlements = getEntitlements(user);
  if (entitlements.savedStrategies <= 0) return { error: "NOT_PAID" };
  const count = getAppDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM strategies WHERE user_id = ? AND archived_at IS NULL",
    )
    .get(user.id) as unknown as { n: number };
  if (count.n >= entitlements.savedStrategies) return { error: "LIMIT" };

  const now = Math.floor(Date.now() / 1000);
  const id = `str_${randomUUID().replace(/-/g, "")}`;
  const sourceHash = hashSource(source);
  const db = getAppDb();
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO strategies
         (id, user_id, name, description, source, source_hash, params_json,
          version, created_at, updated_at, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
    ).run(
      id,
      user.id,
      name.trim() || "Untitled strategy",
      description?.trim() || null,
      source,
      sourceHash,
      paramsJson,
      now,
      now,
    );
    db.prepare(
      `INSERT INTO strategy_versions
         (strategy_id, user_id, version, source, source_hash, params_json, created_at)
       VALUES (?, ?, 1, ?, ?, ?, ?)`,
    ).run(id, user.id, source, sourceHash, paramsJson, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { strategy: getStrategy(user.id, id) ?? undefined };
}

export function updateStrategy(
  user: CurrentUser,
  id: string,
  input: {
    name?: string;
    description?: string;
    source: string;
    paramsJson: string;
  },
): { strategy?: StrategyRow; error?: "NOT_FOUND" | "NOT_PAID" } {
  if (getEntitlements(user).savedStrategies <= 0) return { error: "NOT_PAID" };
  const current = getStrategy(user.id, id);
  if (!current) return { error: "NOT_FOUND" };

  const now = Math.floor(Date.now() / 1000);
  const version = current.version + 1;
  const sourceHash = hashSource(input.source);
  const db = getAppDb();
  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE strategies
       SET name = ?, description = ?, source = ?, source_hash = ?,
           params_json = ?, version = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND archived_at IS NULL`,
    ).run(
      input.name?.trim() || current.name,
      input.description?.trim() || current.description,
      input.source,
      sourceHash,
      input.paramsJson,
      version,
      now,
      id,
      user.id,
    );
    db.prepare(
      `INSERT INTO strategy_versions
         (strategy_id, user_id, version, source, source_hash, params_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, user.id, version, input.source, sourceHash, input.paramsJson, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { strategy: getStrategy(user.id, id) ?? undefined };
}

export function archiveStrategy(userId: string, id: string): boolean {
  const result = getAppDb()
    .prepare(
      "UPDATE strategies SET archived_at = ? WHERE id = ? AND user_id = ? AND archived_at IS NULL",
    )
    .run(Math.floor(Date.now() / 1000), id, userId);
  return Number(result.changes) > 0;
}

export interface RunInput {
  asset: string;
  period: string;
  from: string;
  to: string;
  resolvedOnly: boolean;
  minSamples: number;
  stake: number;
  slippageBps: number;
  feeBps: number;
  params: Record<string, unknown>;
  source: string;
  strategyId?: string | null;
  strategyVersion?: number | null;
  exampleId?: string | null;
  trial?: boolean;
  sweepId?: string | null;
  sweepIndex?: number | null;
}

export function createRun(user: CurrentUser, input: RunInput): RunRow {
  const now = Math.floor(Date.now() / 1000);
  const id = `bt_${randomUUID().replace(/-/g, "")}`;
  const config: BacktestConfig & { trial: boolean; exampleId?: string | null } = {
    asset: input.asset,
    period: input.period as BacktestConfig["period"],
    from: input.from,
    to: input.to,
    resolvedOnly: input.resolvedOnly,
    minSamples: input.minSamples,
    stake: input.stake,
    slippageBps: input.slippageBps,
    feeBps: input.feeBps,
    params: input.params,
    source: input.source,
    strategyId: input.strategyId ?? null,
    strategyVersion: input.strategyVersion ?? null,
    exampleId: input.exampleId ?? null,
    trial: Boolean(input.trial),
    maxWindows: getEntitlements(user).backtestMaxWindows,
    timeLimitMs: input.trial
      ? 120_000
      : getEntitlements(user).backtestMaxDays >= 365
        ? 300_000
        : 120_000,
  };

  getAppDb()
    .prepare(
      `INSERT INTO backtest_runs
         (id, user_id, created_at, status, progress, strategy_id,
          strategy_version, source_hash, config_json, engine_version,
          trial, mode, error, sweep_id, sweep_index)
       VALUES (?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    )
    .run(
      id,
      user.id,
      now,
      input.strategyId ?? null,
      input.strategyVersion ?? null,
      hashSource(input.source),
      JSON.stringify(config),
      ENGINE_VERSION,
      input.trial ? 1 : 0,
      input.sweepId ?? null,
      input.sweepIndex ?? null,
    );

  addBacktestRun(user.id);
  return getRunForWorker(id)!;
}

export function sweepCombinationCount(
  grid: Record<string, unknown>,
): { count?: number; error?: string } {
  const keys = Object.keys(grid);
  if (keys.length === 0) return { error: "Grid must contain at least one parameter." };
  if (keys.length > 4) return { error: "Grid supports at most 4 parameters." };
  let count = 1;
  for (const key of keys) {
    const values = grid[key];
    if (!Array.isArray(values) || values.length === 0) {
      return { error: `Grid parameter ${key} must be a non-empty array.` };
    }
    if (values.length > 20) {
      return { error: `Grid parameter ${key} supports at most 20 values.` };
    }
    count *= values.length;
    if (count > 20) return { error: "A sweep supports at most 20 combinations." };
  }
  return { count };
}

function gridCombinations(
  base: Record<string, unknown>,
  grid: Record<string, unknown>,
): { combinations?: Array<Record<string, unknown>>; error?: string } {
  const keys = Object.keys(grid);
  if (keys.length === 0) return { error: "Grid must contain at least one parameter." };
  if (keys.length > 4) return { error: "Grid supports at most 4 parameters." };

  let combinations: Array<Record<string, unknown>> = [{ ...base }];
  for (const key of keys) {
    const values = grid[key];
    if (!Array.isArray(values) || values.length === 0) {
      return { error: `Grid parameter ${key} must be a non-empty array.` };
    }
    if (values.length > 20) {
      return { error: `Grid parameter ${key} supports at most 20 values.` };
    }
    const next: Array<Record<string, unknown>> = [];
    for (const combination of combinations) {
      for (const value of values) {
        if (
          typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "boolean"
        ) {
          return { error: `Grid parameter ${key} values must be primitive.` };
        }
        next.push({ ...combination, [key]: value });
      }
    }
    combinations = next;
    if (combinations.length > 20) {
      return { error: "A sweep supports at most 20 combinations." };
    }
  }
  return { combinations };
}

export function createSweep(
  user: CurrentUser,
  input: RunInput & { grid: Record<string, unknown> },
): { sweep?: SweepRow; error?: string } {
  const built = gridCombinations(input.params, input.grid);
  if (!built.combinations) return { error: built.error };

  const db = getAppDb();
  const now = Math.floor(Date.now() / 1000);
  const id = `swp_${randomUUID().replace(/-/g, "")}`;
  const config = {
    asset: input.asset,
    period: input.period,
    from: input.from,
    to: input.to,
    resolvedOnly: input.resolvedOnly,
    minSamples: input.minSamples,
    stake: input.stake,
    slippageBps: input.slippageBps,
    feeBps: input.feeBps,
    grid: input.grid,
    source: input.source,
    strategyId: input.strategyId ?? null,
    strategyVersion: input.strategyVersion ?? null,
  };

  db.prepare(
    `INSERT INTO backtest_sweeps
       (id, user_id, created_at, status, config_json, total_runs, completed_runs)
     VALUES (?, ?, ?, 'queued', ?, ?, 0)`,
  ).run(id, user.id, now, JSON.stringify(config), built.combinations.length);

  try {
    built.combinations.forEach((params, index) => {
      createRun(user, {
        ...input,
        params,
        sweepId: id,
        sweepIndex: index,
        trial: false,
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.prepare(
      `UPDATE backtest_runs SET status = 'canceled', finished_at = ?,
         error = 'Sweep creation failed.'
       WHERE sweep_id = ? AND status = 'queued'`,
    ).run(now, id);
    db.prepare(
      "UPDATE backtest_sweeps SET status = 'failed', error = ? WHERE id = ?",
    ).run(message.slice(0, 2_000), id);
    return { error: message };
  }

  return { sweep: getSweepRow(id) ?? undefined };
}

export function getSweepRow(id: string): SweepRow | null {
  const row = getAppDb()
    .prepare("SELECT * FROM backtest_sweeps WHERE id = ?")
    .get(id) as unknown as SweepRow | undefined;
  return row ? { ...row } : null;
}

export function listSweeps(userId: string): SweepRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM backtest_sweeps WHERE user_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 30`,
    )
    .all(userId) as unknown as SweepRow[];
  return rows.map((row) => ({ ...row }));
}

export function getSweepDetail(
  userId: string,
  id: string,
): SweepDetail | null {
  const sweep = getAppDb()
    .prepare(
      "SELECT * FROM backtest_sweeps WHERE id = ? AND user_id = ?",
    )
    .get(id, userId) as unknown as SweepRow | undefined;
  if (!sweep) return null;

  const rows = getAppDb()
    .prepare(
      `SELECT id, sweep_index, status, config_json, summary_json, error
       FROM backtest_runs WHERE sweep_id = ? ORDER BY sweep_index`,
    )
    .all(id) as unknown as Array<{
    id: string;
    sweep_index: number | null;
    status: string;
    config_json: string;
    summary_json: string | null;
    error: string | null;
  }>;

  const runs: SweepRun[] = rows.map((row) => {
    let params: Record<string, unknown> = {};
    try {
      const config = JSON.parse(row.config_json) as {
        params?: Record<string, unknown>;
      };
      params = config.params ?? {};
    } catch {
      params = {};
    }
    const summary = parseSummary(row.summary_json);
    return {
      id: row.id,
      sweep_index: row.sweep_index,
      status: row.status,
      params,
      trades: summary?.trades ?? null,
      pnl: summary?.pnl ?? null,
      winRate: summary?.winRate ?? null,
      roi: summary?.roi ?? null,
      error: row.error,
    };
  });

  return { ...sweep, runs };
}

export function markSweepRunning(sweepId: string): void {
  getAppDb()
    .prepare(
      `UPDATE backtest_sweeps SET status = 'running'
       WHERE id = ? AND status = 'queued'`,
    )
    .run(sweepId);
}

export function refreshSweep(sweepId: string): void {
  const db = getAppDb();
  const rows = db
    .prepare(
      "SELECT status, COUNT(*) AS n FROM backtest_runs WHERE sweep_id = ? GROUP BY status",
    )
    .all(sweepId) as unknown as Array<{ status: string; n: number }>;
  if (rows.length === 0) return;
  const counts = Object.fromEntries(rows.map((row) => [row.status, row.n]));
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const completed =
    (counts.done ?? 0) + (counts.failed ?? 0) + (counts.canceled ?? 0);
  const active = (counts.queued ?? 0) + (counts.running ?? 0);
  let status = "queued";
  if (active > 0) {
    status = (counts.running ?? 0) > 0 ? "running" : "queued";
  } else if ((counts.done ?? 0) === total) {
    status = "done";
  } else if ((counts.canceled ?? 0) === total) {
    status = "canceled";
  } else {
    status = "partial";
  }
  const finishedAt =
    active > 0 ? null : Math.floor(Date.now() / 1000);
  db.prepare(
    `UPDATE backtest_sweeps
     SET status = ?, completed_runs = ?, finished_at = ?
     WHERE id = ?`,
  ).run(status, completed, finishedAt, sweepId);
}

export function listRuns(userId: string): RunPublic[] {
  const rows = getAppDb()
    .prepare(
      `SELECT id, created_at, started_at, finished_at, status, progress,
              strategy_id, strategy_version, summary_json, error, trial, mode
       FROM backtest_runs
       WHERE user_id = ? AND sweep_id IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
    )
    .all(userId) as unknown as Array<
    Omit<RunPublic, "summary" | "trial"> & {
      summary_json: string | null;
      trial: number;
      summary?: never;
    }
  >;

  return rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    status: row.status,
    progress: row.progress,
    strategy_id: row.strategy_id,
    strategy_version: row.strategy_version,
    trial: row.trial === 1,
    mode: row.mode,
    error: row.error,
    summary: parseSummary(row.summary_json),
  }));
}

export function getRunForWorker(id: string): RunRow | null {
  const row = getAppDb()
    .prepare("SELECT * FROM backtest_runs WHERE id = ?")
    .get(id) as unknown as RunRow | undefined;
  return row ? { ...row } : null;
}

export function claimNextRun(): RunRow | null {
  const row = getAppDb()
    .prepare(
      `SELECT * FROM backtest_runs WHERE status = 'queued'
       ORDER BY created_at, id LIMIT 1`,
    )
    .get() as unknown as RunRow | undefined;
  if (!row) return null;

  const now = Math.floor(Date.now() / 1000);
  const result = getAppDb()
    .prepare(
      `UPDATE backtest_runs
       SET status = 'running', started_at = ?, progress = 0
       WHERE id = ? AND status = 'queued'`,
    )
    .run(now, row.id);
  if (Number(result.changes) === 0) return null;
  if (row.sweep_id) markSweepRunning(row.sweep_id);
  return getRunForWorker(row.id);
}

export function updateRunProgress(
  id: string,
  progress: number,
  mode?: string,
): void {
  getAppDb()
    .prepare(
      `UPDATE backtest_runs
       SET progress = ?, mode = COALESCE(?, mode)
       WHERE id = ? AND status = 'running'`,
    )
    .run(Math.min(1, Math.max(0, progress)), mode ?? null, id);
}

export function finishRun(
  id: string,
  summary: BacktestSummary,
  trades: BacktestTrade[],
): void {
  const db = getAppDb();
  const now = Math.floor(Date.now() / 1000);

  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM backtest_trades WHERE run_id = ?").run(id);
    const insert = db.prepare(
      `INSERT INTO backtest_trades
         (run_id, seq, slug, asset, period, side, entry_ts, entry_price,
          shares, stake, exit_ts, exit_price, resolution, pnl, return_pct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const trade of trades) {
      insert.run(
        id,
        trade.seq,
        trade.slug,
        trade.asset,
        trade.period,
        trade.side,
        trade.entryTs,
        trade.entryPrice,
        trade.shares,
        trade.stake,
        trade.exitTs,
        trade.exitPrice,
        trade.resolution,
        trade.pnl,
        trade.returnPct,
      );
    }
    db.prepare(
      `UPDATE backtest_runs
       SET status = 'done', progress = 1, finished_at = ?,
           summary_json = ?, engine_version = ?, data_cutoff = ?, mode = ?,
           error = NULL
       WHERE id = ?`,
    ).run(
      now,
      JSON.stringify(summary),
      summary.engineVersion,
      summary.dataCutoff,
      summary.mode,
      id,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const row = getRunForWorker(id);
  if (row) {
    addBacktestWindows(row.user_id, summary.windows);
    if (row.sweep_id) refreshSweep(row.sweep_id);
  }
}

export function failRun(id: string, error: string): void {
  const db = getAppDb();
  const row = db
    .prepare("SELECT sweep_id FROM backtest_runs WHERE id = ?")
    .get(id) as unknown as { sweep_id: string | null } | undefined;
  db.prepare(
    `UPDATE backtest_runs
     SET status = 'failed', finished_at = ?, error = ?, progress = 0
     WHERE id = ? AND status IN ('queued', 'running')`,
  ).run(Math.floor(Date.now() / 1000), error.slice(0, 2_000), id);
  if (row?.sweep_id) refreshSweep(row.sweep_id);
}

export type CancelResult = "canceled" | "requested" | "not_found" | "not_cancelable";

export function requestCancel(userId: string, id: string): CancelResult {
  const db = getAppDb();
  const row = db
    .prepare(
      "SELECT status, sweep_id FROM backtest_runs WHERE id = ? AND user_id = ?",
    )
    .get(id, userId) as unknown as
    | { status: string; sweep_id: string | null }
    | undefined;
  if (!row) return "not_found";
  const now = Math.floor(Date.now() / 1000);
  if (row.status === "queued") {
    db.prepare(
      `UPDATE backtest_runs
       SET status = 'canceled', finished_at = ?, error = 'Canceled by user.'
       WHERE id = ? AND user_id = ? AND status = 'queued'`,
    ).run(now, id, userId);
    if (row.sweep_id) refreshSweep(row.sweep_id);
    return "canceled";
  }
  if (row.status === "running") {
    db.prepare(
      "UPDATE backtest_runs SET cancel_requested = 1 WHERE id = ? AND user_id = ?",
    ).run(id, userId);
    return "requested";
  }
  return "not_cancelable";
}

export function markRunCanceled(id: string): void {
  const db = getAppDb();
  const row = db
    .prepare("SELECT sweep_id FROM backtest_runs WHERE id = ?")
    .get(id) as unknown as { sweep_id: string | null } | undefined;
  db.prepare(
    `UPDATE backtest_runs
     SET status = 'canceled', finished_at = ?, error = 'Canceled by user.',
         progress = 0
     WHERE id = ? AND status IN ('queued', 'running')`,
  ).run(Math.floor(Date.now() / 1000), id);
  if (row?.sweep_id) refreshSweep(row.sweep_id);
}

export function getRunDetail(
  userId: string,
  id: string,
): RunDetail | null {
  const row = getAppDb()
    .prepare(
      `SELECT id, created_at, started_at, finished_at, status, progress,
              strategy_id, strategy_version, summary_json, error, trial, mode
       FROM backtest_runs
       WHERE id = ? AND user_id = ?`,
    )
    .get(id, userId) as unknown as
    | (Omit<RunPublic, "summary" | "trial"> & {
        summary_json: string | null;
        trial: number;
      })
    | undefined;
  if (!row) return null;

  const trades = getAppDb()
    .prepare(
      `SELECT seq, slug, asset, period, side, entry_ts AS entryTs,
              entry_price AS entryPrice, shares, stake,
              exit_ts AS exitTs, exit_price AS exitPrice, resolution,
              pnl, return_pct AS returnPct
       FROM backtest_trades
       WHERE run_id = ?
       ORDER BY seq
       LIMIT 10000`,
    )
    .all(id) as unknown as BacktestTrade[];

  return {
    id: row.id,
    created_at: row.created_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    status: row.status,
    progress: row.progress,
    strategy_id: row.strategy_id,
    strategy_version: row.strategy_version,
    trial: row.trial === 1,
    mode: row.mode,
    error: row.error,
    summary: parseSummary(row.summary_json),
    trades: trades.map((trade) => ({ ...trade })),
  };
}

export function countActiveRuns(userId: string): number {
  const row = getAppDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM backtest_runs WHERE user_id = ? AND status IN ('queued', 'running')",
    )
    .get(userId) as unknown as { n: number };
  return row.n;
}

export function countTrialRuns(userId: string): number {
  const row = getAppDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM backtest_runs WHERE user_id = ? AND trial = 1",
    )
    .get(userId) as unknown as { n: number };
  return row.n;
}

export function countRunsToday(userId: string): number {
  return getUsage(userId).backtestRuns;
}

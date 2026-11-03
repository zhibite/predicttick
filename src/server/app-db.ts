import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

import { applyMigrations } from "./migrate";
import type { Migration } from "./migrate";

/**
 * Business database: accounts, billing, jobs, strategies and API keys.
 *
 * Kept separate from the large market-data SQLite file so the small business
 * database can be backed up frequently without copying tens of gigabytes of
 * samples.
 */
export const APP_DB_PATH =
  process.env.POLY_APP_DB_PATH?.trim() ||
  path.join(process.cwd(), "data", "app", "app.sqlite");

const MIGRATIONS: Migration[] = [
  {
    version: 8,
    name: "paper trading",
    sql: `
      CREATE TABLE IF NOT EXISTS paper_strategies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        asset TEXT NOT NULL DEFAULT 'btc',
        period TEXT NOT NULL DEFAULT '5m',
        config_json TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 0,
        starting_balance REAL NOT NULL,
        cash REAL NOT NULL,
        realized_pnl REAL NOT NULL DEFAULT 0,
        fees_paid REAL NOT NULL DEFAULT 0,
        last_tick_at INTEGER,
        last_error TEXT,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS paper_positions (
        id TEXT PRIMARY KEY,
        strategy_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        asset TEXT NOT NULL,
        period TEXT NOT NULL,
        title TEXT,
        outcome TEXT NOT NULL,
        shares REAL NOT NULL,
        cost REAL NOT NULL,
        fees REAL NOT NULL DEFAULT 0,
        avg_price REAL NOT NULL,
        last_price REAL,
        last_value REAL,
        opened_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        settled_at INTEGER,
        settlement_price REAL,
        realized_pnl REAL,
        UNIQUE(strategy_id, slug, outcome)
      );
      CREATE INDEX IF NOT EXISTS idx_paper_positions_strategy
        ON paper_positions(strategy_id, status, opened_at);

      CREATE TABLE IF NOT EXISTS paper_trades (
        id TEXT PRIMARY KEY,
        strategy_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        asset TEXT NOT NULL,
        period TEXT NOT NULL,
        title TEXT,
        outcome TEXT NOT NULL,
        side TEXT NOT NULL,
        price REAL NOT NULL,
        shares REAL NOT NULL,
        notional REAL NOT NULL,
        fee REAL NOT NULL DEFAULT 0,
        reason TEXT,
        signal_json TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_paper_trades_strategy
        ON paper_trades(strategy_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS paper_settlements (
        id TEXT PRIMARY KEY,
        strategy_id TEXT NOT NULL,
        position_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        title TEXT,
        outcome TEXT NOT NULL,
        shares REAL NOT NULL,
        payout REAL NOT NULL,
        cost REAL NOT NULL,
        fees REAL NOT NULL DEFAULT 0,
        pnl REAL NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_paper_settlements_strategy
        ON paper_settlements(strategy_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS paper_equity (
        strategy_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        cash REAL NOT NULL,
        positions_value REAL NOT NULL,
        equity REAL NOT NULL,
        realized_pnl REAL NOT NULL,
        unrealized_pnl REAL NOT NULL,
        PRIMARY KEY (strategy_id, ts)
      ) WITHOUT ROWID;
    `,
  },
  {
    version: 7,
    name: "closed position entry time",
    sql: `
      ALTER TABLE leaderboard_closed_positions
        ADD COLUMN first_entry_at INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 6,
    name: "trader leaderboard",
    sql: `
      CREATE TABLE IF NOT EXISTS leaderboard_users (
        id TEXT PRIMARY KEY,
        address TEXT NOT NULL UNIQUE,
        label TEXT,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        sort_priority INTEGER NOT NULL DEFAULT 0,
        profile_name TEXT,
        profile_pseudonym TEXT,
        profile_bio TEXT,
        profile_image TEXT,
        profile_json TEXT,
        metrics_json TEXT,
        last_synced_at INTEGER,
        last_sync_error TEXT,
        last_sync_warning TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_leaderboard_users_active
        ON leaderboard_users(active, sort_priority, created_at);

      CREATE TABLE IF NOT EXISTS leaderboard_positions (
        address TEXT NOT NULL,
        asset TEXT NOT NULL,
        condition_id TEXT,
        title TEXT,
        slug TEXT,
        event_slug TEXT,
        icon TEXT,
        outcome TEXT,
        outcome_index INTEGER,
        size REAL NOT NULL DEFAULT 0,
        avg_price REAL,
        cur_price REAL,
        initial_value REAL,
        current_value REAL,
        cash_pnl REAL,
        percent_pnl REAL,
        total_bought REAL,
        realized_pnl REAL,
        redeemable INTEGER NOT NULL DEFAULT 0,
        end_date TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (address, asset)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS leaderboard_closed_positions (
        address TEXT NOT NULL,
        asset TEXT NOT NULL,
        condition_id TEXT,
        title TEXT,
        slug TEXT,
        event_slug TEXT,
        icon TEXT,
        outcome TEXT,
        outcome_index INTEGER,
        avg_price REAL,
        total_bought REAL,
        realized_pnl REAL,
        cur_price REAL,
        end_date TEXT,
        closed_at INTEGER NOT NULL,
        PRIMARY KEY (address, asset)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS idx_leaderboard_closed_time
        ON leaderboard_closed_positions(address, closed_at DESC);

      CREATE TABLE IF NOT EXISTS leaderboard_activity (
        address TEXT NOT NULL,
        id TEXT NOT NULL,
        tx_hash TEXT,
        timestamp INTEGER NOT NULL,
        type TEXT,
        side TEXT,
        asset TEXT,
        condition_id TEXT,
        title TEXT,
        slug TEXT,
        event_slug TEXT,
        outcome TEXT,
        outcome_index INTEGER,
        size REAL NOT NULL DEFAULT 0,
        price REAL,
        usdc_size REAL,
        trader_name TEXT,
        trader_pseudonym TEXT,
        trader_bio TEXT,
        trader_image TEXT,
        PRIMARY KEY (address, id)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS idx_leaderboard_activity_time
        ON leaderboard_activity(address, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_activity_market
        ON leaderboard_activity(address, condition_id);
    `,
  },
  {
    version: 5,
    name: "jobs monitoring, sweeps and cancellation",
    sql: `
      ALTER TABLE backtest_runs ADD COLUMN sweep_id TEXT;
      ALTER TABLE backtest_runs ADD COLUMN sweep_index INTEGER;
      ALTER TABLE backtest_runs ADD COLUMN cancel_requested INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_backtest_runs_sweep
        ON backtest_runs(sweep_id, sweep_index);

      CREATE TABLE IF NOT EXISTS backtest_sweeps (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        finished_at INTEGER,
        status TEXT NOT NULL,
        config_json TEXT NOT NULL,
        total_runs INTEGER NOT NULL,
        completed_runs INTEGER NOT NULL DEFAULT 0,
        summary_json TEXT,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_backtest_sweeps_user
        ON backtest_sweeps(user_id, created_at);

      CREATE TABLE IF NOT EXISTS job_worker_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        started_at INTEGER,
        heartbeat_at INTEGER,
        export_last_at INTEGER,
        backtest_last_at INTEGER,
        last_error TEXT,
        pid INTEGER
      );
    `,
  },
  {
    version: 4,
    name: "backtest run metadata",
    sql: `
      ALTER TABLE backtest_runs ADD COLUMN trial INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE backtest_runs ADD COLUMN mode TEXT;
      CREATE INDEX IF NOT EXISTS idx_backtest_runs_status
        ON backtest_runs(status, created_at);
    `,
  },
  {
    version: 3,
    name: "export job progress",
    sql: `
      ALTER TABLE export_jobs ADD COLUMN progress REAL NOT NULL DEFAULT 0;
      ALTER TABLE export_jobs ADD COLUMN processed_rows INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_export_jobs_status
        ON export_jobs(status, created_at);
    `,
  },
  {
    version: 2,
    name: "plan copy and payment wallet slots",
    sql: `
      UPDATE plans SET
        name = 'Free',
        features_json = '{"historyDays":30,"backtestTrialRuns":3,"features":["Markets: last 30 days","3 trial backtests","No API or CSV export"]}'
      WHERE code = 'free';

      UPDATE plans SET
        name = 'Basic - 30 days',
        features_json = '{"historyDays":365,"backtestsPerDay":50,"maxBacktestDays":90,"apiKeys":1,"apiRequestsPerDay":10000,"exportBytesPerDay":5368709120,"features":["Markets: 365 days","50 backtests/day","1 API key","5 GB CSV export/day"]}'
      WHERE code = 'basic_30';

      UPDATE plans SET
        name = 'Basic - 365 days',
        features_json = '{"historyDays":365,"backtestsPerDay":50,"maxBacktestDays":90,"apiKeys":1,"apiRequestsPerDay":10000,"exportBytesPerDay":5368709120,"features":["Markets: 365 days","50 backtests/day","1 API key","5 GB CSV export/day"]}'
      WHERE code = 'basic_365';

      UPDATE plans SET
        name = 'Pro - 30 days',
        features_json = '{"historyDays":730,"backtestsPerDay":500,"maxBacktestDays":730,"apiKeys":5,"apiRequestsPerDay":100000,"exportBytesPerDay":53687091200,"features":["Markets: 730 days","500 backtests/day","5 API keys","50 GB CSV export/day","Parameter sweeps"]}'
      WHERE code = 'pro_30';

      UPDATE plans SET
        name = 'Pro - 365 days',
        features_json = '{"historyDays":730,"backtestsPerDay":500,"maxBacktestDays":730,"apiKeys":5,"apiRequestsPerDay":100000,"exportBytesPerDay":53687091200,"features":["Markets: 730 days","500 backtests/day","5 API keys","50 GB CSV export/day","Parameter sweeps"]}'
      WHERE code = 'pro_365';

      INSERT OR IGNORE INTO payment_wallets
        (network, currency, token_contract, token_decimals, deposit_address, explorer_base, active)
      VALUES
        ('tron', 'USDT', '', 0, '', 'https://tronscan.org/#/transaction/', 0),
        ('base', 'USDC', '', 0, '', 'https://basescan.org/tx/', 0),
        ('polygon', 'USDT', '', 0, '', 'https://polygonscan.com/tx/', 0),
        ('polygon', 'USDC', '', 0, '', 'https://polygonscan.com/tx/', 0);
    `,
  },
  {
    version: 1,
    name: "business baseline",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        email_verified_at INTEGER,
        name TEXT,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        token_version INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user
        ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS email_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        purpose TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS plans (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price_usd_cents INTEGER NOT NULL,
        duration_days INTEGER NOT NULL,
        features_json TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      );

      INSERT OR IGNORE INTO plans
        (code, name, price_usd_cents, duration_days, features_json, active)
      VALUES
        ('free', 'Free', 0, 0, '{}', 1),
        ('basic_30', 'Basic 30 days', 1900, 30, '{}', 1),
        ('basic_365', 'Basic 365 days', 18000, 365, '{}', 1),
        ('pro_30', 'Pro 30 days', 5900, 30, '{}', 1),
        ('pro_365', 'Pro 365 days', 56000, 365, '{}', 1);

      CREATE TABLE IF NOT EXISTS crypto_invoices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        plan_code TEXT NOT NULL,
        duration_days INTEGER NOT NULL,
        price_usd_cents INTEGER NOT NULL,
        currency TEXT NOT NULL,
        network TEXT NOT NULL,
        chain_id INTEGER,
        token_contract TEXT NOT NULL,
        token_decimals INTEGER NOT NULL,
        amount_token TEXT NOT NULL,
        deposit_address TEXT NOT NULL,
        status TEXT NOT NULL,
        txid TEXT,
        payer_address TEXT,
        submitted_at INTEGER,
        reviewed_by TEXT,
        reviewed_at INTEGER,
        review_note TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        approved_until INTEGER,
        raw_json TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_crypto_invoices_txid
        ON crypto_invoices(network, txid)
        WHERE txid IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_crypto_invoices_user
        ON crypto_invoices(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_crypto_invoices_status
        ON crypto_invoices(status, created_at);

      CREATE TABLE IF NOT EXISTS user_access (
        user_id TEXT PRIMARY KEY,
        plan_code TEXT,
        access_until INTEGER,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payment_wallets (
        network TEXT NOT NULL,
        currency TEXT NOT NULL,
        token_contract TEXT NOT NULL,
        token_decimals INTEGER NOT NULL,
        deposit_address TEXT NOT NULL,
        explorer_base TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (network, currency)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS usage_daily (
        user_id TEXT NOT NULL,
        day TEXT NOT NULL,
        api_requests INTEGER NOT NULL DEFAULT 0,
        export_bytes INTEGER NOT NULL DEFAULT 0,
        backtest_runs INTEGER NOT NULL DEFAULT 0,
        backtest_windows INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT,
        action TEXT NOT NULL,
        target TEXT,
        metadata_json TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS export_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        api_key_id TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        status TEXT NOT NULL,
        filters_json TEXT NOT NULL,
        format TEXT NOT NULL,
        file_path TEXT,
        rows INTEGER,
        bytes INTEGER,
        error TEXT,
        expires_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_export_jobs_user
        ON export_jobs(user_id, created_at);

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        scopes TEXT NOT NULL,
        rate_limit_per_min INTEGER,
        daily_request_quota INTEGER,
        daily_byte_quota INTEGER,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        revoked_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_user
        ON api_keys(user_id);

      CREATE TABLE IF NOT EXISTS api_usage_daily (
        key_id TEXT NOT NULL,
        day TEXT NOT NULL,
        requests INTEGER NOT NULL DEFAULT 0,
        bytes INTEGER NOT NULL DEFAULT 0,
        errors INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (key_id, day)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS strategies (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        source TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        params_json TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        archived_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_strategies_user
        ON strategies(user_id, archived_at);

      CREATE TABLE IF NOT EXISTS strategy_versions (
        strategy_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        source TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        params_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (strategy_id, version)
      );

      CREATE TABLE IF NOT EXISTS backtest_runs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        status TEXT NOT NULL,
        progress REAL NOT NULL DEFAULT 0,
        strategy_id TEXT,
        strategy_version INTEGER,
        source_hash TEXT NOT NULL,
        config_json TEXT NOT NULL,
        summary_json TEXT,
        engine_version TEXT NOT NULL,
        data_cutoff INTEGER,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_backtest_runs_user
        ON backtest_runs(user_id, created_at);

      CREATE TABLE IF NOT EXISTS backtest_trades (
        run_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        slug TEXT NOT NULL,
        asset TEXT NOT NULL,
        period TEXT NOT NULL,
        side TEXT NOT NULL,
        entry_ts INTEGER NOT NULL,
        entry_price REAL NOT NULL,
        shares REAL NOT NULL,
        stake REAL NOT NULL,
        exit_ts INTEGER,
        exit_price REAL,
        resolution TEXT,
        pnl REAL NOT NULL,
        return_pct REAL NOT NULL,
        PRIMARY KEY (run_id, seq)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS idx_backtest_trades_run_slug
        ON backtest_trades(run_id, slug);
    `,
  },
];

type GlobalWithAppDb = typeof globalThis & {
  __polyklinesAppDb?: DatabaseSync;
};

const globalStore = globalThis as GlobalWithAppDb;

export function getAppDb(): DatabaseSync {
  if (globalStore.__polyklinesAppDb) return globalStore.__polyklinesAppDb;

  fs.mkdirSync(path.dirname(APP_DB_PATH), { recursive: true });
  const db = new DatabaseSync(APP_DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  applyMigrations(db, MIGRATIONS);
  globalStore.__polyklinesAppDb = db;
  return db;
}

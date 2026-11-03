import {
  noteJobWorkerError,
  touchJobWorker,
} from "@/server/jobs/status";
import { getUserById } from "@/server/users";

import { runBacktest } from "./engine";
import type { BacktestConfig } from "./engine";
import { getAppDb } from "@/server/app-db";

import {
  claimNextRun,
  failRun,
  finishRun,
  markRunCanceled,
  updateRunProgress,
} from "./service";

type GlobalWithBacktestWorker = typeof globalThis & {
  __polyBacktestWorkerStarted?: boolean;
};

const globalStore = globalThis as GlobalWithBacktestWorker;
const TICK_MS = 3_000;

async function processNextRun(): Promise<boolean> {
  const run = claimNextRun();
  if (!run) return false;

  const user = getUserById(run.user_id);
  if (!user) {
    failRun(run.id, "User no longer exists.");
    return true;
  }

  const isTrial = run.trial === 1;
  if (!isTrial && user.role !== "admin" && !user.access.isPaid) {
    failRun(run.id, "Access pass expired before the backtest ran.");
    return true;
  }

  let config: BacktestConfig;
  try {
    config = JSON.parse(run.config_json) as BacktestConfig;
  } catch {
    failRun(run.id, "Stored backtest config is invalid.");
    return true;
  }

  let cancelCheck = 0;
  const shouldCancel = () => {
    cancelCheck += 1;
    if (cancelCheck % 10 !== 0) return false;
    const row = getAppDb()
      .prepare(
        "SELECT status, cancel_requested FROM backtest_runs WHERE id = ?",
      )
      .get(run.id) as unknown as
      | { status: string; cancel_requested: number }
      | undefined;
    return !row || row.status === "canceled" || row.cancel_requested === 1;
  };

  try {
    const result = await runBacktest(
      config,
      (progress) => {
        const ratio =
          progress.total > 0 ? progress.processed / progress.total : 0;
        updateRunProgress(run.id, ratio);
      },
      { shouldCancel },
    );
    finishRun(run.id, result.summary, result.trades);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Canceled by user." || shouldCancel()) {
      markRunCanceled(run.id);
    } else {
      failRun(run.id, message);
    }
  }
  return true;
}

/**
 * P4 runs one backtest at a time inside the Next process. QuickJS keeps
 * untrusted strategy code in a WASM sandbox; a dedicated jobs service can
 * replace this loop in the hardening phase.
 */
export function startBacktestWorker(): void {
  if (globalStore.__polyBacktestWorkerStarted) return;
  globalStore.__polyBacktestWorkerStarted = true;
  console.log("[backtest] worker started");
  touchJobWorker("backtest");

  const tick = async () => {
    try {
      await processNextRun();
    } catch (error) {
      console.error("[backtest] worker tick failed", error);
      noteJobWorkerError(error);
    } finally {
      touchJobWorker("backtest");
      setTimeout(tick, TICK_MS);
    }
  };
  setTimeout(tick, 1_500);
}

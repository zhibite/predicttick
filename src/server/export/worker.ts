import {
  noteJobWorkerError,
  touchJobWorker,
} from "@/server/jobs/status";

import {
  cleanupExpiredExportJobs,
  processNextExportJob,
} from "./jobs";

type GlobalWithExportWorker = typeof globalThis & {
  __polyExportWorkerStarted?: boolean;
};

const globalStore = globalThis as GlobalWithExportWorker;

const TICK_MS = 3_000;

/**
 * P2 runs the export worker inside the Next process, one job at a time.
 * Moving it to a dedicated systemd worker is part of the later hardening
 * phase; the job table and file format are already process-compatible.
 */
export function startExportWorker(): void {
  if (globalStore.__polyExportWorkerStarted) return;
  globalStore.__polyExportWorkerStarted = true;

  console.log("[exports] worker started");
  touchJobWorker("export");

  const tick = async () => {
    try {
      await processNextExportJob();
      cleanupExpiredExportJobs();
    } catch (error) {
      console.error("[exports] worker tick failed", error);
      noteJobWorkerError(error);
    } finally {
      touchJobWorker("export");
      setTimeout(tick, TICK_MS);
    }
  };

  setTimeout(tick, 1_000);
}

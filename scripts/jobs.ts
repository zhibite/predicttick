import { startBacktestWorker } from "@/server/backtest/worker";
import { startExportWorker } from "@/server/export/worker";
import { initJobWorkerStatus } from "@/server/jobs/status";

/**
 * Standalone jobs service. Runs export and backtest queues outside the Next
 * process so large jobs cannot stall web requests or the collector.
 */
initJobWorkerStatus();

const exportEnabled = process.env.POLY_EXPORT_WORKER !== "0";
const backtestEnabled = process.env.POLY_BACKTEST_WORKER !== "0";

if (!exportEnabled && !backtestEnabled) {
  console.error("[jobs] both export and backtest workers are disabled");
  process.exit(1);
}

if (exportEnabled) startExportWorker();
if (backtestEnabled) startBacktestWorker();

console.log(
  `[jobs] service started pid=${process.pid} export=${exportEnabled} backtest=${backtestEnabled}`,
);

const shutdown = (signal: string) => {
  console.log(`[jobs] received ${signal}, exiting`);
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

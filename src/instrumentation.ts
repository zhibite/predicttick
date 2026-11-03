export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Initialize the small business DB (accounts, billing, jobs, strategies)
  // even when the market-data collector is disabled in local development.
  const { getAppDb } = await import("./server/app-db");
  getAppDb();

  // Manually curated trader leaderboard: refresh from Polymarket's public
  // Data/Gamma APIs on a schedule while the web process is running.
  if (process.env.POLY_LEADERBOARD_SYNC !== "0") {
    const { startLeaderboardSync } = await import("./server/leaderboard/sync");
    startLeaderboardSync();
  }

  // Admin-only paper trading engine. It is a no-op until an active paper
  // strategy exists, and never places real orders.
  if (process.env.POLY_PAPER_ENGINE !== "0") {
    const { startPaperEngine } = await import("./server/paper/engine");
    startPaperEngine();
  }

  if (process.env.POLY_RESEARCH_ENGINE !== "0") {
    const { startResearchWorker } = await import("./server/research/engine");
    startResearchWorker();
  }

  // Production runs export/backtest jobs in the separate polyklines-jobs
  // service. Set POLY_INLINE_WORKERS=1 only for local dev or a single-process
  // deployment without the jobs service.
  if (process.env.POLY_INLINE_WORKERS === "1") {
    if (process.env.POLY_EXPORT_WORKER !== "0") {
      const { startExportWorker } = await import("./server/export/worker");
      startExportWorker();
    }
    if (process.env.POLY_BACKTEST_WORKER !== "0") {
      const { startBacktestWorker } = await import("./server/backtest/worker");
      startBacktestWorker();
    }
  }

  if (process.env.POLY_COLLECTOR !== "1") return;

  const { startCollector } = await import("./server/collector");
  startCollector();
}

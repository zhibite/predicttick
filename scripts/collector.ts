import { startCollector } from "@/server/collector";

/**
 * Standalone collector process. Runs outside the Next.js web process so web
 * deployments and restarts do not interrupt market-data collection.
 */
startCollector();
console.log(`[collector] standalone service started pid=${process.pid}`);

const shutdown = (signal: string) => {
  console.log(`[collector] received ${signal}, exiting`);
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

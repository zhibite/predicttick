import { NextResponse } from "next/server";

import { getSystemStatus } from "@/server/monitoring";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = getSystemStatus();
    return NextResponse.json(
      {
        status: status.status,
        time: new Date(status.now * 1000).toISOString(),
        collector: {
          heartbeatAgeSeconds: status.collectorHeartbeatAge,
          wsConnections: status.collector?.ws_connections ?? 0,
          activeMarkets: status.collector?.active_markets ?? 0,
          lastError: status.collector?.last_error ?? null,
        },
        jobs: {
          heartbeatAgeSeconds: status.jobsHeartbeatAge,
          pid: status.jobs?.pid ?? null,
          lastError: status.jobs?.lastError ?? null,
        },
        queues: {
          exportQueued: status.queues.exports.queued ?? 0,
          exportRunning: status.queues.exports.running ?? 0,
          backtestQueued: status.queues.backtests.queued ?? 0,
          backtestRunning: status.queues.backtests.running ?? 0,
        },
        diskFreeBytes: status.disk.freeBytes,
      },
      {
        status: status.status === "critical" ? 503 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("GET /api/health failed", error);
    return NextResponse.json(
      { status: "error", error: "Health check failed." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

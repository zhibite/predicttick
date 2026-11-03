import { getCurrentUser } from "@/server/auth";
import {
  countActiveRuns,
  countRunsToday,
  createSweep,
  getStrategy,
  listSweeps,
  sweepCombinationCount,
} from "@/server/backtest/service";
import {
  parseBacktestRange,
  validateBacktestBasics,
  validateStrategySyntax,
} from "@/server/backtest/validate";
import { getEntitlements } from "@/server/entitlements";
import {
  assertSameOrigin,
  jsonError,
  jsonOk,
  rateLimit,
  rateLimitedResponse,
} from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);
  return jsonOk({ sweeps: listSweeps(user.id) });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);

  const isPro =
    user.role === "admin" ||
    (user.access.isPaid && user.access.planCode?.startsWith("pro"));
  if (!isPro) {
    return jsonError(
      "PRO_REQUIRED",
      "Parameter sweeps are available on the Pro plan.",
      402,
    );
  }

  const limit = rateLimit(`backtest-sweep:${user.id}`, 10, 10 * 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfter);

  let body: {
    asset?: unknown;
    period?: unknown;
    from?: unknown;
    to?: unknown;
    resolvedOnly?: unknown;
    minSamples?: unknown;
    stake?: unknown;
    slippageBps?: unknown;
    feeBps?: unknown;
    params?: unknown;
    grid?: unknown;
    source?: unknown;
    strategyId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }

  if (
    typeof body.asset !== "string" ||
    typeof body.period !== "string" ||
    typeof body.from !== "string" ||
    typeof body.to !== "string" ||
    !body.grid ||
    typeof body.grid !== "object" ||
    Array.isArray(body.grid)
  ) {
    return jsonError(
      "BAD_INPUT",
      "asset, period, from, to and a grid object are required.",
    );
  }

  let source: string;
  let strategyId: string | null = null;
  let strategyVersion: number | null = null;
  if (typeof body.strategyId === "string" && body.strategyId) {
    const strategy = getStrategy(user.id, body.strategyId);
    if (!strategy) {
      return jsonError("STRATEGY_NOT_FOUND", "Strategy not found.", 404);
    }
    source = strategy.source;
    strategyId = strategy.id;
    strategyVersion = strategy.version;
  } else if (typeof body.source === "string") {
    source = body.source;
  } else {
    return jsonError("BAD_INPUT", "Provide strategyId or source.", 400);
  }

  let params: Record<string, unknown> = {};
  if (body.params != null) {
    if (typeof body.params !== "object" || Array.isArray(body.params)) {
      return jsonError("BAD_PARAMS", "params must be a JSON object.");
    }
    params = body.params as Record<string, unknown>;
  } else if (strategyId) {
    try {
      params = JSON.parse(
        getStrategy(user.id, strategyId)?.params_json ?? "{}",
      ) as Record<string, unknown>;
    } catch {
      params = {};
    }
  }

  const syntaxError = validateStrategySyntax(source);
  if (syntaxError) {
    return jsonError(syntaxError.code, syntaxError.message, syntaxError.status);
  }

  const stake = body.stake == null ? 10 : Number(body.stake);
  const slippageBps = body.slippageBps == null ? 0 : Number(body.slippageBps);
  const feeBps = body.feeBps == null ? 0 : Number(body.feeBps);
  const minSamples =
    body.minSamples == null ? 0 : Number(body.minSamples);

  const basicsError = validateBacktestBasics({
    asset: body.asset.toLowerCase(),
    period: body.period,
    source,
    params,
    stake,
    slippageBps,
    feeBps,
    minSamples,
  });
  if (basicsError) {
    return jsonError(basicsError.code, basicsError.message, basicsError.status);
  }

  const rangeResult = parseBacktestRange(user, body.from, body.to);
  if (rangeResult.error) {
    return jsonError(
      rangeResult.error.code,
      rangeResult.error.message,
      rangeResult.error.status,
    );
  }

  const grid = body.grid as Record<string, unknown>;
  const countResult = sweepCombinationCount(grid);
  if (countResult.count == null) {
    return jsonError("BAD_GRID", countResult.error ?? "Invalid grid.", 400);
  }

  const entitlements = getEntitlements(user);
  if (countRunsToday(user.id) + countResult.count > entitlements.backtestRunsPerDay) {
    return jsonError(
      "DAILY_QUOTA_EXCEEDED",
      `This sweep would exceed today's ${entitlements.backtestRunsPerDay} run quota.`,
      429,
    );
  }
  if (countActiveRuns(user.id) > 0) {
    return jsonError(
      "CONCURRENCY_LIMIT",
      "Finish active or queued backtests before starting a sweep.",
      429,
    );
  }

  try {
    const result = createSweep(user, {
      asset: body.asset.toLowerCase(),
      period: body.period,
      from: body.from,
      to: body.to,
      resolvedOnly: body.resolvedOnly !== false,
      minSamples,
      stake,
      slippageBps,
      feeBps,
      params,
      source,
      strategyId,
      strategyVersion,
      grid,
      trial: false,
    });
    if (result.error) {
      return jsonError("SWEEP_FAILED", result.error, 400);
    }
    return jsonOk({ sweep: result.sweep }, 201);
  } catch (error) {
    console.error("POST /api/backtest/sweeps failed", error);
    return jsonError("SWEEP_FAILED", "Could not create the sweep.", 500);
  }
}

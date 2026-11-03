import { getCurrentUser } from "@/server/auth";
import { getExample, STRATEGY_EXAMPLES } from "@/server/backtest/examples";
import {
  countActiveRuns,
  countRunsToday,
  countTrialRuns,
  createRun,
  getStrategy,
  listRuns,
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
  return jsonOk({ runs: listRuns(user.id), examples: STRATEGY_EXAMPLES });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);

  const limit = rateLimit(`backtest-create:${user.id}`, 30, 10 * 60_000);
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
    source?: unknown;
    strategyId?: unknown;
    exampleId?: unknown;
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
    typeof body.to !== "string"
  ) {
    return jsonError("BAD_INPUT", "asset, period, from and to are required.");
  }

  const entitlements = getEntitlements(user);
  const isPaid = user.role === "admin" || user.access.isPaid;
  let trial = false;
  let exampleId: string | null = null;
  let strategyId: string | null = null;
  let strategyVersion: number | null = null;
  let source: string;
  let params: Record<string, unknown>;

  if (!isPaid) {
    if (entitlements.backtestTrialRuns <= 0) {
      return jsonError(
        "PAYMENT_REQUIRED",
        "Backtests require a paid access pass.",
        402,
      );
    }
    if (countTrialRuns(user.id) >= entitlements.backtestTrialRuns) {
      return jsonError(
        "TRIAL_EXHAUSTED",
        "Your trial backtests are used up. Upgrade to continue.",
        402,
      );
    }
    if (typeof body.exampleId !== "string") {
      return jsonError(
        "TRIAL_EXAMPLES_ONLY",
        "Free trial runs must use a built-in example strategy.",
        400,
      );
    }
    const example = getExample(body.exampleId);
    if (!example) {
      return jsonError("EXAMPLE_NOT_FOUND", "Unknown example strategy.", 404);
    }
    exampleId = example.id;
    source = example.source;
    trial = true;
  } else if (typeof body.strategyId === "string" && body.strategyId) {
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

  if (body.params != null) {
    if (typeof body.params !== "object" || Array.isArray(body.params)) {
      return jsonError("BAD_PARAMS", "params must be a JSON object.");
    }
    params = body.params as Record<string, unknown>;
  } else if (strategyId) {
    const strategy = getStrategy(user.id, strategyId);
    try {
      params = JSON.parse(strategy?.params_json ?? "{}") as Record<string, unknown>;
    } catch {
      params = {};
    }
  } else {
    params = {};
  }

  const stake = body.stake == null ? 10 : Number(body.stake);
  const slippageBps = body.slippageBps == null ? 0 : Number(body.slippageBps);
  const feeBps = body.feeBps == null ? 0 : Number(body.feeBps);
  const minSamples =
    body.minSamples == null ? 0 : Number(body.minSamples);

  const syntaxError = validateStrategySyntax(source);
  if (syntaxError) {
    return jsonError(syntaxError.code, syntaxError.message, syntaxError.status);
  }

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

  if (!isPaid) {
    // Free trial still uses the same concurrency and range checks.
  } else if (countRunsToday(user.id) >= entitlements.backtestRunsPerDay) {
    return jsonError(
      "DAILY_QUOTA_EXCEEDED",
      "Daily backtest quota exceeded.",
      429,
    );
  }
  if (countActiveRuns(user.id) >= entitlements.backtestConcurrency) {
    return jsonError(
      "CONCURRENCY_LIMIT",
      "Finish a queued or running backtest before starting another.",
      429,
    );
  }

  try {
    const run = createRun(user, {
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
      exampleId,
      trial,
    });
    return jsonOk(
      {
        run: {
          id: run.id,
          status: run.status,
          trial: run.trial === 1,
        },
      },
      201,
    );
  } catch (error) {
    console.error("POST /api/backtest/runs failed", error);
    return jsonError("RUN_FAILED", "Could not create the backtest.", 500);
  }
}

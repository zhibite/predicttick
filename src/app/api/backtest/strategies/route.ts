import { getCurrentUser } from "@/server/auth";
import {
  MAX_PARAMS_BYTES,
  MAX_SOURCE_BYTES,
  validateStrategySyntax,
} from "@/server/backtest/validate";
import {
  createStrategy,
  listStrategies,
} from "@/server/backtest/service";
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
  return jsonOk({ strategies: listStrategies(user.id) });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);

  const limit = rateLimit(`strategy-save:${user.id}`, 20, 10 * 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfter);

  let body: {
    name?: unknown;
    description?: unknown;
    source?: unknown;
    params?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }

  if (typeof body.name !== "string" || typeof body.source !== "string") {
    return jsonError("BAD_INPUT", "name and source are required.");
  }
  if (Buffer.byteLength(body.source, "utf8") > MAX_SOURCE_BYTES) {
    return jsonError("SOURCE_TOO_LARGE", "Strategy source is larger than 64 KB.");
  }
  const syntaxError = validateStrategySyntax(body.source);
  if (syntaxError) {
    return jsonError(syntaxError.code, syntaxError.message, syntaxError.status);
  }
  if (
    body.params != null &&
    (typeof body.params !== "object" || Array.isArray(body.params))
  ) {
    return jsonError("BAD_PARAMS", "params must be a JSON object.");
  }
  const paramsJson = JSON.stringify(body.params ?? {});
  if (Buffer.byteLength(paramsJson, "utf8") > MAX_PARAMS_BYTES) {
    return jsonError("PARAMS_TOO_LARGE", "Strategy params are larger than 16 KB.");
  }

  try {
    const result = createStrategy(
      user,
      body.name,
      body.source,
      paramsJson,
      typeof body.description === "string" ? body.description : undefined,
    );
    if (result.error === "NOT_PAID") {
      return jsonError(
        "PAYMENT_REQUIRED",
        "Saved strategies require a paid access pass.",
        402,
      );
    }
    if (result.error === "LIMIT") {
      return jsonError(
        "STRATEGY_LIMIT",
        "You have reached the saved strategy limit for your plan.",
        409,
      );
    }
    return jsonOk({ strategy: result.strategy }, 201);
  } catch (error) {
    console.error("POST /api/backtest/strategies failed", error);
    return jsonError("SAVE_FAILED", "Could not save the strategy.", 500);
  }
}

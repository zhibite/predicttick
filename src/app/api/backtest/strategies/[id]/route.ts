import { getCurrentUser } from "@/server/auth";
import {
  archiveStrategy,
  getStrategy,
  updateStrategy,
} from "@/server/backtest/service";
import {
  MAX_PARAMS_BYTES,
  MAX_SOURCE_BYTES,
  validateStrategySyntax,
} from "@/server/backtest/validate";
import { assertSameOrigin, jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);
  const { id } = await params;
  const strategy = getStrategy(user.id, id);
  if (!strategy) return jsonError("NOT_FOUND", "Strategy not found.", 404);
  return jsonOk({ strategy });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);
  const { id } = await params;

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
  if (typeof body.source !== "string") {
    return jsonError("BAD_INPUT", "source is required.");
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
    const result = updateStrategy(user, id, {
      source: body.source,
      paramsJson,
      name: typeof body.name === "string" ? body.name : undefined,
      description:
        typeof body.description === "string" ? body.description : undefined,
    });
    if (result.error === "NOT_FOUND") {
      return jsonError("NOT_FOUND", "Strategy not found.", 404);
    }
    if (result.error === "NOT_PAID") {
      return jsonError(
        "PAYMENT_REQUIRED",
        "Saved strategies require a paid access pass.",
        402,
      );
    }
    return jsonOk({ strategy: result.strategy });
  } catch (error) {
    console.error(`PUT /api/backtest/strategies/${id} failed`, error);
    return jsonError("SAVE_FAILED", "Could not save the strategy.", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);
  const { id } = await params;
  if (!archiveStrategy(user.id, id)) {
    return jsonError("NOT_FOUND", "Strategy not found.", 404);
  }
  return jsonOk({ ok: true });
}

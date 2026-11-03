import { getCurrentUser } from "@/server/auth";
import { requestCancel } from "@/server/backtest/service";
import { assertSameOrigin, jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);
  const { id } = await params;
  const result = requestCancel(user.id, id);
  if (result === "not_found") {
    return jsonError("NOT_FOUND", "Backtest run not found.", 404);
  }
  if (result === "not_cancelable") {
    return jsonError(
      "NOT_CANCELABLE",
      "Only queued or running backtests can be canceled.",
      409,
    );
  }
  return jsonOk({
    ok: true,
    status: result,
    message:
      result === "requested"
        ? "Cancellation requested. The worker will stop at the next checkpoint."
        : "Backtest canceled.",
  });
}

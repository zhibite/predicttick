import { consumeEmailToken, updatePassword } from "@/server/auth";
import {
  assertSameOrigin,
  clientIp,
  jsonError,
  jsonOk,
  rateLimit,
  rateLimitedResponse,
} from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }

  const limit = rateLimit(`reset:${clientIp(request)}`, 10, 15 * 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfter);

  let body: { token?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }
  if (typeof body.token !== "string" || typeof body.password !== "string") {
    return jsonError("BAD_INPUT", "Token and password are required.");
  }
  if (body.password.length < 8) {
    return jsonError(
      "WEAK_PASSWORD",
      "Password must be at least 8 characters.",
    );
  }

  const userId = consumeEmailToken(body.token, "reset_password");
  if (!userId) {
    return jsonError(
      "INVALID_TOKEN",
      "This reset link is invalid or has expired.",
      400,
    );
  }

  updatePassword(userId, body.password);
  return jsonOk({ ok: true });
}

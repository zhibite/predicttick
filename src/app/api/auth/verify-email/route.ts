import { consumeEmailToken, markEmailVerified } from "@/server/auth";
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

  const limit = rateLimit(`verify:${clientIp(request)}`, 20, 15 * 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfter);

  let body: { token?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }
  if (typeof body.token !== "string" || !body.token) {
    return jsonError("BAD_INPUT", "Verification token is required.");
  }

  const userId = consumeEmailToken(body.token, "verify_email");
  if (!userId) {
    return jsonError(
      "INVALID_TOKEN",
      "This verification link is invalid or has expired.",
      400,
    );
  }

  markEmailVerified(userId);
  return jsonOk({ ok: true });
}

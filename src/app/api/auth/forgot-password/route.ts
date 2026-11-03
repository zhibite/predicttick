import {
  appUrl,
  createEmailToken,
  getUserIdByEmail,
  logEmailLink,
} from "@/server/auth";
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

  const limit = rateLimit(`forgot:${clientIp(request)}`, 10, 15 * 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfter);

  let body: { email?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }
  if (typeof body.email !== "string") {
    return jsonError("BAD_INPUT", "Email is required.");
  }

  const userId = getUserIdByEmail(body.email);
  if (userId) {
    const token = createEmailToken(userId, "reset_password");
    logEmailLink(
      "reset_password",
      body.email,
      `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`,
    );
  }

  // Always return ok so the endpoint cannot be used to enumerate accounts.
  return jsonOk({
    ok: true,
    message: "If that email exists, a reset link has been sent.",
  });
}

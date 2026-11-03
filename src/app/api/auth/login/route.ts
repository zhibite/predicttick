import {
  authenticateUser,
  createSessionToken,
  setSessionCookie,
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

  const limit = rateLimit(`login:${clientIp(request)}`, 15, 15 * 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfter);

  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }

  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return jsonError("BAD_INPUT", "Email and password are required.");
  }

  try {
    const result = authenticateUser(body.email, body.password);
    if (result.error) {
      return jsonError(
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
        401,
      );
    }
    if (result.unverified) {
      return jsonError(
        "EMAIL_NOT_VERIFIED",
        "Verify your email before signing in.",
        403,
      );
    }
    if (!result.user) {
      return jsonError("LOGIN_FAILED", "Could not sign in.", 500);
    }

    const token = createSessionToken(result.user.id);
    await setSessionCookie(token);
    return jsonOk({ ok: true, user: result.user });
  } catch (error) {
    console.error("POST /api/auth/login failed", error);
    return jsonError("LOGIN_FAILED", "Could not sign in.", 500);
  }
}

import {
  appUrl,
  createSessionToken,
  logEmailLink,
  registerUser,
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

  const limit = rateLimit(`register:${clientIp(request)}`, 10, 15 * 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfter);

  let body: { email?: unknown; password?: unknown; name?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }

  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return jsonError("BAD_INPUT", "Email and password are required.");
  }

  try {
    const result = registerUser(
      body.email,
      body.password,
      typeof body.name === "string" ? body.name : undefined,
    );

    if (result.error === "EMAIL_IN_USE") {
      return jsonError("EMAIL_IN_USE", "That email is already registered.", 409);
    }
    if (result.error === "INVALID_EMAIL") {
      return jsonError("INVALID_EMAIL", "Enter a valid email address.");
    }
    if (result.error === "WEAK_PASSWORD") {
      return jsonError(
        "WEAK_PASSWORD",
        "Password must be at least 8 characters.",
      );
    }
    if (!result.user) {
      return jsonError("REGISTER_FAILED", "Could not create the account.", 500);
    }

    if (result.verificationToken) {
      logEmailLink(
        "verify_email",
        result.user.email,
        `${appUrl()}/verify-email?token=${encodeURIComponent(result.verificationToken)}`,
      );
    }

    const requiresVerification =
      process.env.POLY_REQUIRE_EMAIL_VERIFICATION === "1";
    if (requiresVerification) {
      return jsonOk({
        ok: true,
        requiresVerification: true,
        user: result.user,
      });
    }

    const token = createSessionToken(result.user.id);
    await setSessionCookie(token);
    return jsonOk({ ok: true, user: result.user });
  } catch (error) {
    console.error("POST /api/auth/register failed", error);
    return jsonError("REGISTER_FAILED", "Could not create the account.", 500);
  }
}

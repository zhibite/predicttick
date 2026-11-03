import {
  activeKeyCount,
  createApiKey,
  listApiKeys,
} from "@/server/api-keys";
import { getCurrentUser } from "@/server/auth";
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

  const entitlements = getEntitlements(user);
  return jsonOk({
    keys: listApiKeys(user.id),
    limit: entitlements.apiKeys,
    active: activeKeyCount(user.id),
    requestsPerDay: entitlements.apiRequestsPerDay,
    ratePerMinute: entitlements.apiRatePerMinute,
  });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }

  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);

  const limit = rateLimit(`api-key-create:${user.id}`, 10, 10 * 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfter);

  let body: { name?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }
  const name = typeof body.name === "string" ? body.name : "Default key";

  try {
    const result = createApiKey(user, name);
    if (result.error === "API_NOT_INCLUDED") {
      return jsonError(
        "PAYMENT_REQUIRED",
        "API access is not included in your current plan.",
        402,
      );
    }
    if (result.error === "KEY_LIMIT") {
      return jsonError(
        "KEY_LIMIT",
        "You have reached the API key limit for your plan.",
        409,
      );
    }
    return jsonOk({ key: result.key, token: result.token }, 201);
  } catch (error) {
    console.error("POST /api/account/api-keys failed", error);
    return jsonError("KEY_CREATE_FAILED", "Could not create the API key.", 500);
  }
}

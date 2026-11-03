import { getCurrentUser } from "@/server/auth";
import {
  createInvoice,
  listUserInvoices,
  paymentsEnabled,
} from "@/server/billing";
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
  return jsonOk({
    invoices: listUserInvoices(user.id),
    paymentsEnabled: paymentsEnabled(),
  });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }

  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);

  const limit = rateLimit(`invoice:${user.id}`, 10, 10 * 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfter);

  let body: {
    planCode?: unknown;
    network?: unknown;
    currency?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }
  if (
    typeof body.planCode !== "string" ||
    typeof body.network !== "string" ||
    typeof body.currency !== "string"
  ) {
    return jsonError(
      "BAD_INPUT",
      "planCode, network and currency are required.",
    );
  }

  try {
    const result = createInvoice(
      user.id,
      body.planCode,
      body.network,
      body.currency,
    );
    if (result.error) {
      const map: Record<string, [number, string, string]> = {
        PAYMENTS_DISABLED: [
          409,
          "PAYMENT_NOT_CONFIGURED",
          "Crypto payments are not available yet.",
        ],
        WALLET_NOT_CONFIGURED: [
          409,
          "PAYMENT_NOT_CONFIGURED",
          "This payment network is not configured yet.",
        ],
        PLAN_NOT_FOUND: [404, "PLAN_NOT_FOUND", "Unknown or inactive plan."],
        TOO_MANY_PENDING: [
          429,
          "TOO_MANY_PENDING",
          "Too many pending invoices. Finish or wait for one to expire.",
        ],
      };
      const [status, code, message] = map[result.error] ?? [
        400,
        result.error,
        "Could not create the invoice.",
      ];
      return jsonError(code, message, status);
    }
    return jsonOk({ invoice: result.invoice }, 201);
  } catch (error) {
    console.error("POST /api/billing/invoices failed", error);
    return jsonError("INVOICE_FAILED", "Could not create the invoice.", 500);
  }
}

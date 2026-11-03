import { getCurrentUser } from "@/server/auth";
import { submitInvoice } from "@/server/billing";
import {
  assertSameOrigin,
  jsonError,
  jsonOk,
} from "@/server/http";

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
  let body: { txid?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }
  if (typeof body.txid !== "string") {
    return jsonError("BAD_INPUT", "txid is required.");
  }

  try {
    const result = submitInvoice(user.id, id, body.txid);
    if (result.error) {
      const map: Record<string, [number, string, string]> = {
        INVOICE_NOT_FOUND: [404, "INVOICE_NOT_FOUND", "Invoice not found."],
        INVALID_STATUS: [
          409,
          "INVALID_STATUS",
          "This invoice is not awaiting payment.",
        ],
        INVALID_TXID: [
          400,
          "INVALID_TXID",
          "Enter a valid transaction hash.",
        ],
        EXPIRED: [410, "EXPIRED", "This invoice has expired."],
        TXID_USED: [
          409,
          "TXID_USED",
          "This transaction has already been submitted.",
        ],
      };
      const [status, code, message] = map[result.error] ?? [
        400,
        result.error,
        "Could not submit the payment.",
      ];
      return jsonError(code, message, status);
    }
    return jsonOk({ invoice: result.invoice });
  } catch (error) {
    console.error(`POST /api/billing/invoices/${id}/submit failed`, error);
    return jsonError("SUBMIT_FAILED", "Could not submit the payment.", 500);
  }
}

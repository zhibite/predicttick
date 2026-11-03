import { getCurrentUser } from "@/server/auth";
import { approveInvoice } from "@/server/billing";
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
  if (user.role !== "admin") {
    return jsonError("FORBIDDEN", "Admin access required.", 403);
  }

  const { id } = await params;
  let note: string | undefined;
  try {
    const body = (await request.json()) as { note?: unknown };
    if (typeof body.note === "string") note = body.note;
  } catch {
    // Notes are optional.
  }

  try {
    const result = approveInvoice(user.id, id, note);
    if (result.error === "INVOICE_NOT_FOUND") {
      return jsonError("INVOICE_NOT_FOUND", "Invoice not found.", 404);
    }
    if (result.error === "INVALID_STATUS") {
      return jsonError(
        "INVALID_STATUS",
        "Only submitted invoices can be approved.",
        409,
      );
    }
    return jsonOk({ invoice: result.invoice });
  } catch (error) {
    console.error(`POST /api/admin/payments/${id}/approve failed`, error);
    return jsonError("APPROVE_FAILED", "Could not approve the invoice.", 500);
  }
}

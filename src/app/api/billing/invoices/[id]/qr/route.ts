import { getCurrentUser } from "@/server/auth";
import { getInvoice } from "@/server/billing";
import { paymentQr } from "@/server/payments/qr";
import { jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);

  const { id } = await params;
  const invoice = getInvoice(id);
  if (!invoice) return jsonError("NOT_FOUND", "Invoice not found.", 404);
  if (invoice.user_id !== user.id && user.role !== "admin") {
    return jsonError("FORBIDDEN", "This invoice belongs to another account.", 403);
  }
  if (!invoice.deposit_address) {
    return jsonError(
      "PAYMENT_NOT_CONFIGURED",
      "This invoice has no deposit address.",
      409,
    );
  }

  try {
    const qr = await paymentQr(invoice);
    return jsonOk({
      invoiceId: invoice.id,
      network: invoice.network,
      currency: invoice.currency,
      amountToken: invoice.amount_token,
      address: invoice.deposit_address,
      uri: qr.uri,
      mode: qr.mode,
      qrDataUrl: qr.qrDataUrl,
    });
  } catch (error) {
    console.error(`GET /api/billing/invoices/${id}/qr failed`, error);
    return jsonError("QR_FAILED", "Could not generate the payment QR code.", 500);
  }
}

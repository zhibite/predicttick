import { getCurrentUser } from "@/server/auth";
import { listInvoicesForAdmin, paymentsEnabled } from "@/server/billing";
import { jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);
  if (user.role !== "admin") {
    return jsonError("FORBIDDEN", "Admin access required.", 403);
  }

  return jsonOk({
    invoices: listInvoicesForAdmin(),
    paymentsEnabled: paymentsEnabled(),
  });
}

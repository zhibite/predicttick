import { getCurrentUser } from "@/server/auth";
import { jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return jsonOk({
    user,
    paymentsEnabled: process.env.POLY_PAYMENTS_ENABLED === "1",
  });
}

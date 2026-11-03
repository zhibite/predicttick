import { getCurrentUser } from "@/server/auth";
import { getSweepDetail } from "@/server/backtest/service";
import { jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);
  const { id } = await params;
  const sweep = getSweepDetail(user.id, id);
  if (!sweep) return jsonError("NOT_FOUND", "Sweep not found.", 404);
  return jsonOk({ sweep });
}

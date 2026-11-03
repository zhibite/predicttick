import { getCurrentUser } from "@/server/auth";
import { recordAudit } from "@/server/billing";
import { assertSameOrigin, jsonError, jsonOk } from "@/server/http";
import {
  deleteResearchRun,
  getResearchRunDetail,
} from "@/server/research/store";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("UNAUTHORIZED", "Sign in required.", 401) };
  if (user.role !== "admin") {
    return { error: jsonError("FORBIDDEN", "Admin access required.", 403) };
  }
  return { user };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const detail = getResearchRunDetail(id);
  if (!detail) {
    return jsonError("NOT_FOUND", "Research run not found.", 404);
  }
  return jsonOk(detail);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const detail = getResearchRunDetail(id);
  if (!detail) {
    return jsonError("NOT_FOUND", "Research run not found.", 404);
  }
  deleteResearchRun(id);
  recordAudit(auth.user.id, "research.run.delete", id, {
    address: detail.run.address,
  });
  return jsonOk({ ok: true });
}

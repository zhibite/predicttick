import { getCurrentUser } from "@/server/auth";
import { recordAudit } from "@/server/billing";
import { assertSameOrigin, jsonError, jsonOk } from "@/server/http";
import { resetPaperStrategy } from "@/server/paper/store";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("UNAUTHORIZED", "Sign in required.", 401) };
  if (user.role !== "admin") {
    return { error: jsonError("FORBIDDEN", "Admin access required.", 403) };
  }
  return { user };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const strategy = resetPaperStrategy(id);
  if (!strategy) {
    return jsonError("NOT_FOUND", "Strategy not found.", 404);
  }
  recordAudit(auth.user.id, "paper.strategy.reset", id, {
    name: strategy.name,
  });
  return jsonOk({ strategy });
}

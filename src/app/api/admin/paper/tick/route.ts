import { getCurrentUser } from "@/server/auth";
import { assertSameOrigin, jsonError, jsonOk } from "@/server/http";
import { tickPaperEngine } from "@/server/paper/engine";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("UNAUTHORIZED", "Sign in required.", 401) };
  if (user.role !== "admin") {
    return { error: jsonError("FORBIDDEN", "Admin access required.", 403) };
  }
  return { user };
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  return jsonOk(tickPaperEngine());
}

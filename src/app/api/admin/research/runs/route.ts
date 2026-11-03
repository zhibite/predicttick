import { getCurrentUser } from "@/server/auth";
import { recordAudit } from "@/server/billing";
import { assertSameOrigin, jsonError, jsonOk } from "@/server/http";
import {
  createResearchRun,
  listResearchRuns,
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

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  return jsonOk({ runs: listResearchRuns(30) });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: { address?: unknown; maxTrades?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }
  if (typeof body.address !== "string" || !body.address.trim()) {
    return jsonError("BAD_ADDRESS", "Enter a wallet address.");
  }
  const maxTrades =
    typeof body.maxTrades === "number" && Number.isFinite(body.maxTrades)
      ? Math.min(1_000_000, Math.max(0, Math.floor(body.maxTrades)))
      : 20_000;

  const result = createResearchRun({
    address: body.address,
    maxTrades,
    createdBy: auth.user.id,
  });
  if ("error" in result) {
    return jsonError("BAD_ADDRESS", result.error);
  }

  recordAudit(auth.user.id, "research.run.create", result.run.id, {
    address: result.run.address,
    maxTrades: result.run.max_trades,
  });
  return jsonOk({ run: result.run }, 201);
}

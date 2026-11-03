import { getCurrentUser } from "@/server/auth";
import { recordAudit } from "@/server/billing";
import { assertSameOrigin, jsonError, jsonOk } from "@/server/http";
import {
  createPaperStrategy,
  listPaperStrategies,
} from "@/server/paper/store";
import type { PaperStrategyKind } from "@/server/paper/types";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("UNAUTHORIZED", "Sign in required.", 401) };
  if (user.role !== "admin") {
    return { error: jsonError("FORBIDDEN", "Admin access required.", 403) };
  }
  return { user };
}

function parseConfig(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  return jsonOk({ strategies: listPaperStrategies() });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: {
    name?: unknown;
    kind?: unknown;
    asset?: unknown;
    period?: unknown;
    startingBalance?: unknown;
    config?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }

  if (typeof body.name !== "string") {
    return jsonError("BAD_NAME", "Enter a strategy name.");
  }
  if (body.kind !== "pair_lock" && body.kind !== "mid_maker") {
    return jsonError("BAD_KIND", "Unknown strategy kind.");
  }

  const result = createPaperStrategy({
    name: body.name,
    kind: body.kind as PaperStrategyKind,
    asset: typeof body.asset === "string" ? body.asset : undefined,
    period: typeof body.period === "string" ? body.period : undefined,
    startingBalance:
      typeof body.startingBalance === "number"
        ? body.startingBalance
        : undefined,
    config: parseConfig(body.config),
    createdBy: auth.user.id,
  });

  if ("error" in result) {
    return jsonError("BAD_STRATEGY", result.error);
  }

  recordAudit(auth.user.id, "paper.strategy.create", result.strategy.id, {
    name: result.strategy.name,
    kind: result.strategy.kind,
  });

  return jsonOk({ strategy: result.strategy }, 201);
}

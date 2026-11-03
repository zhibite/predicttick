import { getCurrentUser } from "@/server/auth";
import { recordAudit } from "@/server/billing";
import { assertSameOrigin, jsonError, jsonOk } from "@/server/http";
import {
  deletePaperStrategy,
  getPaperStrategyDetail,
  updatePaperStrategy,
} from "@/server/paper/store";

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
  const detail = getPaperStrategyDetail(id);
  if (!detail) {
    return jsonError("NOT_FOUND", "Strategy not found.", 404);
  }
  return jsonOk(detail);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  let body: { name?: unknown; active?: unknown; config?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }

  if (body.name !== undefined && typeof body.name !== "string") {
    return jsonError("BAD_NAME", "Invalid name.");
  }
  if (body.active !== undefined && typeof body.active !== "boolean") {
    return jsonError("BAD_INPUT", "Invalid active flag.");
  }
  if (
    body.name === undefined &&
    body.active === undefined &&
    body.config === undefined
  ) {
    return jsonError("NO_CHANGES", "Nothing to update.");
  }

  let config: unknown = body.config;
  if (typeof config === "string") {
    try {
      config = JSON.parse(config) as unknown;
    } catch {
      return jsonError("BAD_CONFIG", "Config must be valid JSON.");
    }
  }

  const updated = updatePaperStrategy(id, {
    ...(typeof body.name === "string" ? { name: body.name } : {}),
    ...(typeof body.active === "boolean" ? { active: body.active } : {}),
    ...(config !== undefined ? { config } : {}),
  });
  if (!updated) {
    return jsonError("NOT_FOUND", "Strategy not found.", 404);
  }

  recordAudit(auth.user.id, "paper.strategy.update", id, {
    active: updated.active === 1,
    name: updated.name,
  });

  return jsonOk({ strategy: updated });
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
  const detail = getPaperStrategyDetail(id);
  if (!detail) {
    return jsonError("NOT_FOUND", "Strategy not found.", 404);
  }
  deletePaperStrategy(id);
  recordAudit(auth.user.id, "paper.strategy.delete", id, {
    name: detail.strategy.name,
  });
  return jsonOk({ ok: true });
}

import { getCurrentUser } from "@/server/auth";
import { recordAudit } from "@/server/billing";
import { assertSameOrigin, jsonError, jsonOk } from "@/server/http";
import {
  deleteLeaderboardUser,
  getLeaderboardEntryById,
  updateLeaderboardUser,
} from "@/server/leaderboard/store";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("UNAUTHORIZED", "Sign in required.", 401) };
  if (user.role !== "admin") {
    return { error: jsonError("FORBIDDEN", "Admin access required.", 403) };
  }
  return { user };
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
  let body: {
    label?: unknown;
    notes?: unknown;
    active?: unknown;
    sortPriority?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }

  if (body.label !== undefined && typeof body.label !== "string") {
    return jsonError("BAD_INPUT", "Invalid label.");
  }
  if (body.notes !== undefined && typeof body.notes !== "string") {
    return jsonError("BAD_INPUT", "Invalid notes.");
  }
  if (body.active !== undefined && typeof body.active !== "boolean") {
    return jsonError("BAD_INPUT", "Invalid active flag.");
  }
  if (
    body.sortPriority !== undefined &&
    (typeof body.sortPriority !== "number" ||
      !Number.isInteger(body.sortPriority))
  ) {
    return jsonError("BAD_INPUT", "Invalid sort priority.");
  }
  if (typeof body.label === "string" && body.label.length > 80) {
    return jsonError("BAD_LABEL", "Label must be 80 characters or fewer.");
  }
  if (typeof body.notes === "string" && body.notes.length > 1_000) {
    return jsonError("BAD_NOTES", "Notes must be 1000 characters or fewer.");
  }
  if (
    body.label === undefined &&
    body.notes === undefined &&
    body.active === undefined &&
    body.sortPriority === undefined
  ) {
    return jsonError("NO_CHANGES", "Nothing to update.");
  }

  const updated = updateLeaderboardUser(id, {
    ...(body.label !== undefined
      ? { label: body.label as string }
      : {}),
    ...(body.notes !== undefined
      ? { notes: body.notes as string }
      : {}),
    ...(body.active !== undefined ? { active: body.active as boolean } : {}),
    ...(body.sortPriority !== undefined
      ? { sortPriority: body.sortPriority as number }
      : {}),
  });
  if (!updated) {
    return jsonError("NOT_FOUND", "Trader not found.", 404);
  }

  recordAudit(auth.user.id, "leaderboard.user.update", updated.address, {
    label: updated.label,
    active: updated.active === 1,
    sortPriority: updated.sort_priority,
  });

  return jsonOk({ user: getLeaderboardEntryById(id, true) });
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
  const entry = getLeaderboardEntryById(id, true);
  if (!entry) {
    return jsonError("NOT_FOUND", "Trader not found.", 404);
  }

  deleteLeaderboardUser(id);
  recordAudit(auth.user.id, "leaderboard.user.delete", entry.address, {
    label: entry.label,
  });

  return jsonOk({ ok: true });
}

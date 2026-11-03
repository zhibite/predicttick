import { getCurrentUser } from "@/server/auth";
import { recordAudit } from "@/server/billing";
import {
  assertSameOrigin,
  jsonError,
  jsonOk,
} from "@/server/http";
import {
  createLeaderboardUser,
  getLeaderboardEntryById,
  listLeaderboardEntries,
} from "@/server/leaderboard/store";
import { syncLeaderboardUser } from "@/server/leaderboard/sync";

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

  return jsonOk({ users: listLeaderboardEntries(true, true) });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }

  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: {
    address?: unknown;
    label?: unknown;
    notes?: unknown;
    active?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }

  if (typeof body.address !== "string" || !body.address.trim()) {
    return jsonError("BAD_ADDRESS", "Enter a Polymarket wallet address.");
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

  const label = typeof body.label === "string" ? body.label.trim() : null;
  const notes = typeof body.notes === "string" ? body.notes.trim() : null;
  if (label && label.length > 80) {
    return jsonError("BAD_LABEL", "Label must be 80 characters or fewer.");
  }
  if (notes && notes.length > 1_000) {
    return jsonError("BAD_NOTES", "Notes must be 1000 characters or fewer.");
  }

  const created = createLeaderboardUser({
    address: body.address,
    label,
    notes,
    active: body.active ?? true,
  });
  if ("error" in created) {
    if (created.error === "INVALID_ADDRESS") {
      return jsonError(
        "BAD_ADDRESS",
        "Enter a valid 0x wallet address (40 hex characters).",
      );
    }
    return jsonError(
      "DUPLICATE",
      "This address is already on the leaderboard.",
      409,
    );
  }

  recordAudit(
    auth.user.id,
    "leaderboard.user.create",
    created.user.address,
    { label, active: created.user.active === 1 },
  );

  // Fetch the public profile, positions and recent activity before returning
  // so the admin immediately sees whether the address is usable.
  const sync = await syncLeaderboardUser(created.user.id);
  const entry = getLeaderboardEntryById(created.user.id, true);

  return jsonOk({ user: entry, sync }, 201);
}

import { getCurrentUser } from "@/server/auth";
import { assertSameOrigin, jsonError, jsonOk } from "@/server/http";
import {
  getLeaderboardEntryById,
  getLeaderboardUserByAddress,
  listLeaderboardEntries,
} from "@/server/leaderboard/store";
import {
  syncAllLeaderboardUsers,
  syncLeaderboardUser,
} from "@/server/leaderboard/sync";

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

  let body: { id?: unknown; address?: unknown; all?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // An empty body means "sync every active trader".
  }

  if (body.id !== undefined && typeof body.id !== "string") {
    return jsonError("BAD_INPUT", "Invalid trader id.");
  }
  if (body.address !== undefined && typeof body.address !== "string") {
    return jsonError("BAD_INPUT", "Invalid wallet address.");
  }

  const singleId =
    typeof body.id === "string"
      ? body.id
      : typeof body.address === "string"
        ? getLeaderboardUserByAddress(body.address)?.id
        : undefined;

  if (body.all === true || (!singleId && typeof body.address !== "string")) {
    const summary = await syncAllLeaderboardUsers({ force: true });
    return jsonOk({
      summary,
      users: listLeaderboardEntries(true, true),
    });
  }

  if (!singleId) {
    return jsonError("NOT_FOUND", "Trader not found.", 404);
  }

  const sync = await syncLeaderboardUser(singleId);
  return jsonOk({
    sync,
    user: getLeaderboardEntryById(singleId, true),
  });
}

import { revokeApiKey } from "@/server/api-keys";
import { getCurrentUser } from "@/server/auth";
import { assertSameOrigin, jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }

  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);

  const { id } = await params;
  try {
    const revoked = revokeApiKey(user.id, id);
    if (!revoked) {
      return jsonError("NOT_FOUND", "API key not found or already revoked.", 404);
    }
    return jsonOk({ ok: true });
  } catch (error) {
    console.error(`DELETE /api/account/api-keys/${id} failed`, error);
    return jsonError("REVOKE_FAILED", "Could not revoke the API key.", 500);
  }
}

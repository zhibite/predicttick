import { logoutCurrentSession } from "@/server/auth";
import { assertSameOrigin, jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }

  await logoutCurrentSession();
  return jsonOk({ ok: true });
}

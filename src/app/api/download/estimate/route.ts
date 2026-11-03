import { getCurrentUser } from "@/server/auth";
import {
  canStreamDirect,
  evaluateDownload,
  MAX_DIRECT_BYTES,
  MAX_DIRECT_ROWS,
} from "@/server/export/access";
import { parseExportFilters } from "@/server/export/csv";
import { jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("UNAUTHORIZED", "Sign in required.", 401);

  const params = new URL(request.url).searchParams;
  const parsed = parseExportFilters({
    asset: params.get("asset") ?? undefined,
    period: params.get("period") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    dataset: params.get("dataset") ?? undefined,
    resolved: params.get("resolved") ?? undefined,
    interval: params.get("interval") ?? undefined,
    format: params.get("format") ?? undefined,
  });
  if (!parsed.filters) {
    return jsonError("BAD_FILTERS", parsed.error ?? "Invalid filters.");
  }

  const guard = evaluateDownload(user, parsed.filters);
  if (guard.error) {
    return jsonError(guard.error.code, guard.error.message, guard.error.status);
  }
  const limits = guard.limits!;

  return jsonOk({
    filters: parsed.filters,
    estimate: limits.estimate,
    entitlements: limits.entitlements,
    usage: limits.usage,
    remainingBytes: limits.remainingBytes,
    earliestDay: limits.earliestDay,
    canDirect: canStreamDirect(limits.estimate),
    maxDirectRows: MAX_DIRECT_ROWS,
    maxDirectBytes: MAX_DIRECT_BYTES,
  });
}

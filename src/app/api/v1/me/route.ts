import {
  apiJson,
  apiPreflight,
  requireApiKey,
} from "@/server/api/v1";
import { getUsage } from "@/server/usage";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const auth = requireApiKey(request, "data:read");
  if (auth.response) return auth.response;
  const { context, meta } = auth;
  const usage = getUsage(context!.user.id);

  return apiJson(
    request,
    {
      data: {
        user: {
          id: context!.user.id,
          email: context!.user.email,
          name: context!.user.name,
          role: context!.user.role,
        },
        key: {
          id: context!.key.id,
          name: context!.key.name,
          prefix: context!.key.prefix,
          scopes: context!.key.scopes
            .split(",")
            .map((scope) => scope.trim())
            .filter(Boolean),
        },
        plan: {
          code: context!.user.access.planCode,
          accessUntil: context!.user.access.accessUntil,
          isPaid: context!.user.access.isPaid,
        },
        limits: context!.limits,
        usage,
      },
      meta: { requestId: meta!.requestId },
    },
    meta!,
  );
}

export function OPTIONS(request: Request) {
  return apiPreflight(request);
}

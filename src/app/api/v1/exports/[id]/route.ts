import {
  apiError,
  apiJson,
  apiPreflight,
  requireApiKey,
} from "@/server/api/v1";
import { getExportJob } from "@/server/export/jobs";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiKey(request, "export:read");
  if (auth.response) return auth.response;
  const { context, meta } = auth;
  const { id } = await params;

  const job = getExportJob(id);
  if (!job) {
    return apiError(request, "NOT_FOUND", "Export job not found.", 404, meta);
  }
  if (job.user_id !== context!.user.id && context!.user.role !== "admin") {
    return apiError(request, "FORBIDDEN", "This export belongs to another account.", 403, meta);
  }

  return apiJson(
    request,
    {
      data: {
        ...job,
        file_path: null,
        downloadUrl:
          job.status === "done"
            ? `/api/v1/exports/${encodeURIComponent(job.id)}/file`
            : null,
      },
      meta: { requestId: meta!.requestId },
    },
    meta!,
  );
}

export function OPTIONS(request: Request) {
  return apiPreflight(request);
}

import { apiHeaders, apiPreflight } from "@/server/api/v1";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const body = {
    status: "ok",
    service: "polyklines-api",
    version: "v1",
    time: new Date().toISOString(),
  };
  return new Response(JSON.stringify(body), {
    headers: {
      ...Object.fromEntries(apiHeaders(request)),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function OPTIONS(request: Request) {
  return apiPreflight(request);
}

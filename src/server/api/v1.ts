import { randomUUID } from "node:crypto";

import {
  authenticateApiKey,
  hasScope,
  recordApiRequest,
  touchApiKey,
  type ApiKeyContext,
} from "@/server/api-keys";
import { getUsage } from "@/server/usage";
import {
  jsonError,
  rateLimit,
  type RateLimitResult,
} from "@/server/http";

export interface ApiRequestMeta {
  requestId: string;
  rate: RateLimitResult;
  plan: string;
}

export interface ApiAuthResult {
  context?: ApiKeyContext;
  meta?: ApiRequestMeta;
  response?: Response;
}

function requestId(): string {
  return randomUUID();
}

function allowedOrigin(request: Request): string {
  const configured = process.env.POLY_API_CORS_ORIGINS?.trim();
  if (!configured || configured === "*") return "*";
  const origin = request.headers.get("origin");
  const allowed = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (origin && allowed.includes(origin)) return origin;
  return allowed[0] ?? "*";
}

export function apiHeaders(
  request: Request,
  meta?: ApiRequestMeta,
): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", allowedOrigin(request));
  headers.set("Vary", "Origin");
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-API-Key",
  );
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set(
    "Access-Control-Expose-Headers",
    "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Plan, X-Request-Id",
  );
  if (meta) {
    headers.set("X-Request-Id", meta.requestId);
    headers.set("X-Plan", meta.plan);
    headers.set("X-RateLimit-Limit", String(meta.rate.limit));
    headers.set("X-RateLimit-Remaining", String(meta.rate.remaining));
    headers.set("X-RateLimit-Reset", String(Math.ceil(meta.rate.resetAt / 1000)));
  }
  return headers;
}

export function apiJson(
  request: Request,
  body: unknown,
  meta: ApiRequestMeta,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...Object.fromEntries(apiHeaders(request, meta)),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function apiError(
  request: Request,
  code: string,
  message: string,
  status = 400,
  meta?: ApiRequestMeta,
  extra?: Record<string, unknown>,
): Response {
  const id = meta?.requestId ?? requestId();
  const response = jsonError(code, message, status, {
    requestId: id,
    ...(extra ?? {}),
  });
  for (const [key, value] of apiHeaders(
    request,
    meta ?? {
      requestId: id,
      rate: { ok: true, retryAfter: 0, limit: 0, remaining: 0, resetAt: 0 },
      plan: "unknown",
    },
  )) {
    response.headers.set(key, value);
  }
  return response;
}

export function apiPreflight(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: apiHeaders(request),
  });
}

export function extractApiKey(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (match) return match[1]!.trim();
  }
  return request.headers.get("x-api-key")?.trim() || null;
}

export function requireApiKey(
  request: Request,
  requiredScope?: string,
): ApiAuthResult {
  const token = extractApiKey(request);
  if (!token) {
    return {
      response: apiError(
        request,
        "UNAUTHORIZED",
        "Provide an API key via Authorization: Bearer or X-API-Key.",
        401,
      ),
    };
  }

  const auth = authenticateApiKey(token);
  if (auth.error === "INVALID_KEY") {
    return {
      response: apiError(
        request,
        "INVALID_API_KEY",
        "The API key is invalid or revoked.",
        401,
      ),
    };
  }
  if (auth.error === "PAYMENT_REQUIRED") {
    return {
      response: apiError(
        request,
        "PAYMENT_REQUIRED",
        "The account needs an active access pass to use the API.",
        402,
      ),
    };
  }
  const context = auth.context!;

  if (requiredScope && !hasScope(context.key, requiredScope)) {
    return {
      response: apiError(
        request,
        "FORBIDDEN",
        `This key does not have the ${requiredScope} scope.`,
        403,
      ),
    };
  }

  const rate = rateLimit(
    `v1:${context.key.id}`,
    context.limits.ratePerMinute,
    60_000,
  );
  const meta: ApiRequestMeta = {
    requestId: requestId(),
    rate,
    plan: context.entitlements.apiKeys > 0
      ? context.user.access.planCode ?? "admin"
      : "free",
  };

  if (!rate.ok) {
    const response = apiError(
      request,
      "RATE_LIMITED",
      "Rate limit exceeded.",
      429,
      meta,
    );
    response.headers.set("Retry-After", String(rate.retryAfter));
    return { response };
  }

  const usage = getUsage(context.user.id);
  if (usage.apiRequests >= context.limits.requestsPerDay) {
    return {
      response: apiError(
        request,
        "DAILY_QUOTA_EXCEEDED",
        "Daily API request quota exceeded.",
        429,
        meta,
      ),
    };
  }

  recordApiRequest(context.user.id, context.key.id);
  touchApiKey(context.key.id);

  return { context, meta };
}

export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as T;
  } catch {
    return null;
  }
}

export function parseLimit(
  value: string | null,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

export function utcIso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

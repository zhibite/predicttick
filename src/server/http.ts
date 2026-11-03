import { NextResponse } from "next/server";

export function jsonError(
  code: string,
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(extra ?? {}) } },
    { status },
  );
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Basic CSRF guard for cookie-authenticated write endpoints. Requests without
 * an Origin header (curl, server-to-server) are allowed; browsers send it.
 */
export function assertSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfter: number;
  limit: number;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      ok: true,
      retryAfter: 0,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
    };
  }
  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      limit,
      remaining: 0,
      resetAt: bucket.resetAt,
    };
  }
  bucket.count += 1;
  return {
    ok: true,
    retryAfter: 0,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function rateLimitedResponse(retryAfter: number): NextResponse {
  const response = jsonError(
    "RATE_LIMITED",
    "Too many requests. Please try again later.",
    429,
  );
  response.headers.set("Retry-After", String(retryAfter));
  return response;
}

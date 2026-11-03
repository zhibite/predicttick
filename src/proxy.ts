import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "poly_session";

export function proxy(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.next();
  }

  const signIn = request.nextUrl.clone();
  signIn.pathname = "/signin";
  signIn.search = `?next=${encodeURIComponent(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  )}`;
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    "/account/:path*",
    "/backtest/:path*",
    "/download/:path*",
    "/strategies/:path*",
  ],
};

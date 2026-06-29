import { NextResponse, type NextRequest } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";

const PUBLIC_PATHS = ["/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip Next.js internals, public assets, and the login route.
  // /p/<ref> is the public PDF redirect — customers without an account
  // need to follow these links straight to Drive. /p/proof/<ref> is
  // the customer-facing headstone proof page, which talks to
  // /api/headstones/proof-data, /api/headstones/proof, and
  // /api/headstones/submit-estimate-changes — those three must also be
  // public so the page works without a session.
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/logout") ||
    pathname === "/api/feed" ||
    pathname.startsWith("/p/") ||
    pathname === "/api/headstones/proof-data" ||
    pathname === "/api/headstones/proof" ||
    pathname === "/api/headstones/submit-estimate-changes" ||
    pathname === "/favicon.ico" ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await readSessionToken(token);

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|letterhead.png|with-grace.png).*)"],
};

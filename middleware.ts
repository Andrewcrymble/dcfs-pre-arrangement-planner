import { NextResponse, type NextRequest } from "next/server";
import { readSessionToken, readSsoToken, SESSION_COOKIE, SSO_COOKIE } from "@/lib/auth";

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
  let session = await readSessionToken(token);
  // Hub single sign-on: a valid dcfs_sso pass (set by crymbleandsons.com's
  // login for the whole zone) counts the same as a planner session.
  if (!session) {
    session = await readSsoToken(req.cookies.get(SSO_COOKIE)?.value);
  }

  if (!session) {
    // On the live domain, bounce via the Hub login — if the person is
    // already signed in to the Hub it returns immediately with a pass, so
    // staff never see a second login screen. Local dev keeps /login.
    if (req.nextUrl.hostname.endsWith("crymbleandsons.com")) {
      const hubLogin = new URL("https://crymbleandsons.com/admin/login");
      hubLogin.searchParams.set("next", req.nextUrl.href);
      return NextResponse.redirect(hubLogin);
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|letterhead.png|with-grace.png).*)"],
};

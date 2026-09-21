// Reads are public, writes need the session cookie, settings does not exist
// without it. See docs/spec.md section 2.
import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, sessionCookie } from "./lib/auth.ts";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Signing in has to be reachable while signed out, or there is no way in.
const ALWAYS_OPEN = ["/api/session"];

// Not rendered at all when signed out, rather than rendered and refused.
const PRIVATE_PAGES = ["/settings"];

function isUnder(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isUnder(pathname, ALWAYS_OPEN)) return NextResponse.next();

  const authenticated = await isValidSession(
    request.cookies.get(sessionCookie.name)?.value,
  );

  if (isUnder(pathname, PRIVATE_PAGES)) {
    // A 404 rather than a redirect: signed out, the page is not there at all.
    return authenticated
      ? NextResponse.next()
      : NextResponse.rewrite(new URL("/404", request.url), { status: 404 });
  }

  if (!READ_METHODS.has(request.method) && !authenticated) {
    return NextResponse.json(
      { error: "Sign in to make changes." },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets and the favicon, so a signed out
  // visitor still gets a styled page rather than an unstyled one.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

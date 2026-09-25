// The home page and signing in are public. Everything else needs the session
// cookie. See docs/spec.md section 2.
//
// Browsing used to be public against seeded demo data. It is not: a visitor
// landing on tables of someone else's invoices learns nothing about the
// product, so the home page carries the story and the app is for whoever signs
// in.
import { NextResponse, type NextRequest } from "next/server.js";
import { isValidSession, sessionCookie } from "./lib/auth.ts";

// Signing in has to be reachable while signed out, or there is no way in.
const ALWAYS_OPEN = ["/api/session"];

function isUnder(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isUnder(pathname, ALWAYS_OPEN)) return NextResponse.next();

  const authenticated = await isValidSession(
    request.cookies.get(sessionCookie.name)?.value,
  );
  if (authenticated) return NextResponse.next();

  // The home page is matched exactly, since as a prefix "/" would match
  // everything. /login keeps its prefix so its own assets come with it.
  if (pathname === "/" || isUnder(pathname, ["/login"])) return NextResponse.next();

  // An API route answers rather than redirects, so a fetch gets a readable
  // error instead of the HTML of the sign in page.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  // A page sends the visitor somewhere they can act: sign in, and come back to
  // where they were headed.
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own assets and the favicon, so a signed out
  // visitor still gets a styled page rather than an unstyled one.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

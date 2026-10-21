// The home page and signing in are public. Everything else needs the session
// cookie. See docs/spec.md section 2.
//
// Browsing used to be public against seeded demo data. It is not: a visitor
// landing on tables of someone else's invoices learns nothing about the
// product, so the home page carries the story and the app is for whoever signs
// in.
import { NextResponse, type NextRequest } from "next/server.js";
import { sessionRole, sessionCookie } from "./lib/auth.ts";

// Signing in has to be reachable while signed out, or there is no way in.
const ALWAYS_OPEN = ["/api/session"];

// Callers that never hold a session: the Vercel cron, the worker handing on to
// itself, and Blob's upload-completed callback. Each route checks its own
// secret or signature (and the upload route checks the session before it hands
// out a token). Exact paths only: /api/contracts/start sends the cron secret on
// the owner's behalf, so it stays behind the session.
const MACHINE_ROUTES = new Set([
  "/api/contracts/sweep",
  "/api/contracts/worker",
  "/api/contracts/upload",
]);

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isUnder(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isUnder(pathname, ALWAYS_OPEN) || MACHINE_ROUTES.has(pathname)) {
    return NextResponse.next();
  }

  const role = await sessionRole(request.cookies.get(sessionCookie.name)?.value);
  if (role === "owner") return NextResponse.next();

  // The demo looks at everything and changes nothing. Server actions are POSTs
  // to the page's own path, so refusing every method that is not a read covers
  // actions and API routes in one place. Settings is where the paid keys are,
  // so it is not shown at all (#233).
  if (role === "demo") {
    if (!READ_METHODS.has(request.method)) {
      return NextResponse.json({ error: "The demo is read only." }, { status: 403 });
    }
    if (isUnder(pathname, ["/settings"])) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

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

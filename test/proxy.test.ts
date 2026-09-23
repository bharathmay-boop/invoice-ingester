// The token helpers are only half the authorisation boundary. The other half is
// the proxy's path matching, method classification and branch ordering, and a
// regression in any of those would expose writes or settings while the token
// tests carry on passing.
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SETTINGS_MASTER_KEY = Buffer.alloc(32, 5).toString("base64");
process.env.ADMIN_PASSWORD = "a-long-enough-test-password";

const { NextRequest } = await import("next/server.js");
const { proxy } = await import("../proxy.ts");
const { mintSession, sessionCookie } = await import("../lib/auth.ts");

const session = await mintSession();

function request(path: string, method = "GET", token?: string) {
  return new NextRequest(new URL(`http://localhost${path}`), {
    method,
    headers: token ? { cookie: `${sessionCookie.name}=${token}` } : {},
  });
}

/** 200 means the proxy let it through to the app. */
async function status(path: string, method = "GET", token?: string) {
  return (await proxy(request(path, method, token))).status;
}

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const READ_METHODS = ["GET", "HEAD", "OPTIONS"];

/** Where a redirect points, so "signed out" can be told from "wrong page". */
async function redirectTo(path: string) {
  const response = await proxy(request(path));
  assert.equal(response.status, 307, `${path} should redirect`);
  const location = new URL(response.headers.get("location") ?? "", "http://localhost");
  return `${location.pathname}${location.search}`;
}

test("only the home page and signing in are public", async () => {
  for (const method of READ_METHODS) {
    for (const path of ["/", "/login"]) {
      assert.equal(await status(path, method), 200, `${method} ${path}`);
    }
  }
});

test("every other page sends a signed out visitor to sign in, and remembers where they were going", async () => {
  assert.equal(await redirectTo("/items"), "/login?next=%2Fitems");
  assert.equal(await redirectTo("/vendors/abc"), "/login?next=%2Fvendors%2Fabc");
  assert.equal(await redirectTo("/upload"), "/login?next=%2Fupload");
  assert.equal(await redirectTo("/settings"), "/login?next=%2Fsettings");
  assert.equal(await redirectTo("/review/1"), "/login?next=%2Freview%2F1");
});

test("a query string survives the round trip, so a filtered list comes back filtered", async () => {
  const to = await redirectTo("/items?search=paper");
  assert.equal(to, "/login?next=%2Fitems%3Fsearch%3Dpaper");
});

test("an API route answers rather than redirecting", async () => {
  // A fetch wants a readable error, not the HTML of the sign in page.
  for (const method of [...READ_METHODS, ...WRITE_METHODS]) {
    assert.equal(await status("/api/items", method), 401, `${method} /api/items`);
  }
  const response = await proxy(request("/api/invoices", "POST"));
  assert.deepEqual(await response.json(), { error: "Sign in first." });
});

test("a session opens everything", async () => {
  for (const path of ["/items", "/vendors/abc", "/upload", "/settings", "/review/1", "/api/items"]) {
    assert.equal(await status(path, "GET", session), 200, path);
  }
  for (const method of WRITE_METHODS) {
    assert.equal(await status("/api/invoices", method, session), 200, method);
  }
});

test("signing in is reachable while signed out", async () => {
  assert.equal(await status("/api/session", "POST"), 200);
  assert.equal(await status("/api/session", "DELETE"), 200);
});

test("the session exemption does not extend to neighbouring paths", async () => {
  assert.equal(await status("/api/sessions", "POST"), 401);
  assert.equal(await status("/api/session-admin", "POST"), 401);
});

test("the home page is matched exactly, not as a prefix of everything", async () => {
  // "/" as a prefix would make every page public.
  assert.equal(await status("/items"), 307);
  assert.equal(await status("/"), 200);
});

test("an invalid session is treated as no session", async () => {
  for (const bad of ["", "garbage", "9999999999.AAAA", `${session}x`]) {
    assert.equal(await status("/api/invoices", "POST", bad), 401, bad);
    assert.equal(await status("/settings", "GET", bad), 307, bad);
  }
});

test("an expired session is treated as no session", async () => {
  const expired = await mintSession(Date.now() - 15 * 24 * 60 * 60 * 1000);
  assert.equal(await status("/api/invoices", "POST", expired), 401);
  assert.equal(await status("/settings", "GET", expired), 307);
});

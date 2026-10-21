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

test("the cron, the worker chain and the Blob callback reach their own checks without a cookie", async () => {
  // None of these callers holds a session. Each route checks its own secret or
  // signature, so the proxy has to let them through or contracts are never read.
  assert.equal(await status("/api/contracts/sweep", "GET"), 200);
  assert.equal(await status("/api/contracts/worker", "POST"), 200);
  assert.equal(await status("/api/contracts/upload", "POST"), 200);
});

test("the machine exemptions are exact paths, not a prefix of /api/contracts", async () => {
  // start sends the cron secret on the owner's behalf, so it must stay behind the session.
  assert.equal(await status("/api/contracts/start", "POST"), 401);
  assert.equal(await status("/api/contracts", "POST"), 401);
  assert.equal(await status("/api/contracts/worker/extra", "POST"), 401);
  assert.equal(await status("/api/contracts/sweeper", "GET"), 401);
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

// --- the read-only demo session (#233) --------------------------------------

const { mintDemoSession } = await import("../lib/auth.ts");
const demo = await mintDemoSession();

test("a demo session reads every page and API route except settings", async () => {
  for (const path of ["/items", "/vendors/abc", "/invoices", "/contracts/1", "/findings", "/api/original"]) {
    for (const method of READ_METHODS) {
      assert.equal(await status(path, method, demo), 200, `${method} ${path}`);
    }
  }
});

test("a demo session cannot write anything, route or server action", async () => {
  // Server actions are POSTs to the page's own path, so a page path stands in
  // for every action on it.
  for (const path of ["/api/invoices", "/api/extract", "/api/upload", "/api/contracts/start", "/review/1", "/items/1", "/suggestions", "/settings"]) {
    for (const method of WRITE_METHODS) {
      assert.equal(await status(path, method, demo), 403, `${method} ${path}`);
    }
  }
  const response = await proxy(request("/api/invoices", "POST", demo));
  assert.deepEqual(await response.json(), { error: "The demo is read only." });
});

test("a demo session never sees settings, where the paid keys live", async () => {
  const response = await proxy(request("/settings", "GET", demo));
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location") ?? "").pathname, "/");
});

test("a demo visitor can still sign out, and an owner can still write", async () => {
  assert.equal(await status("/api/session", "DELETE", demo), 200);
  assert.equal(await status("/api/invoices", "POST", session), 200);
});

test("the machine routes are untouched by a demo cookie", async () => {
  // Each checks its own secret, so the proxy passes them through whatever cookie comes along.
  assert.equal(await status("/api/contracts/worker", "POST", demo), 200);
  assert.equal(await status("/api/contracts/upload", "POST", demo), 200);
});

test("taking a demo session is reachable while signed out", async () => {
  // The route itself only sets mintDemoSession's token, which the auth tests cover.
  assert.equal(await status("/api/session/demo", "POST"), 200);
});

// --- where sign in sends you afterwards ------------------------------------

const { safeNext } = await import("../lib/next-path.ts");

test("the return path can only ever be a page on this site", () => {
  assert.equal(safeNext("/items?search=paper"), "/items?search=paper");
  assert.equal(safeNext("/settings"), "/settings");

  // Everything a stranger could put in the URL to send someone elsewhere.
  // "//evil.example" is a URL to another site that looks like a path.
  for (const hostile of [
    "//evil.example",
    "https://evil.example",
    "http://evil.example/items",
    "javascript:alert(1)",
    "evil.example",
    "",
    null,
    // Browsers read a backslash as a slash and drop tabs and newlines, so each
    // of these starts with one "/" and still points at another host.
    "/\\evil.example",
    "/\\/evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
  ]) {
    assert.equal(safeNext(hostile), "/", JSON.stringify(hostile));
  }
});

test("a return path keeps its query and fragment", () => {
  assert.equal(safeNext("/items?q=a%20b#top"), "/items?q=a%20b#top");
  assert.equal(safeNext("/"), "/");
});

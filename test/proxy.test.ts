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

test("reads are public", async () => {
  for (const method of READ_METHODS) {
    for (const path of ["/", "/login", "/items", "/vendors/abc", "/api/items"]) {
      assert.equal(await status(path, method), 200, `${method} ${path}`);
    }
  }
});

test("writes are refused without a session", async () => {
  for (const method of WRITE_METHODS) {
    for (const path of ["/api/invoices", "/api/items/1", "/anything"]) {
      assert.equal(await status(path, method), 401, `${method} ${path}`);
    }
  }
});

test("writes are allowed with a session", async () => {
  for (const method of WRITE_METHODS) {
    assert.equal(await status("/api/invoices", method, session), 200, method);
  }
});

test("settings does not exist without a session", async () => {
  for (const path of ["/settings", "/settings/keys", "/settings/matching"]) {
    assert.equal(await status(path), 404, path);
    assert.equal(await status(path, "GET", session), 200, `${path} signed in`);
  }
});

test("a path merely starting with the same letters is not settings", async () => {
  // /settings-export must not inherit the /settings rule in either direction.
  assert.equal(await status("/settings-export"), 200);
});

test("signing in is reachable while signed out", async () => {
  assert.equal(await status("/api/session", "POST"), 200);
  assert.equal(await status("/api/session", "DELETE"), 200);
});

test("the session exemption does not extend to neighbouring paths", async () => {
  assert.equal(await status("/api/sessions", "POST"), 401);
  assert.equal(await status("/api/session-admin", "POST"), 401);
});

test("an invalid session is treated as no session", async () => {
  for (const bad of ["", "garbage", "9999999999.AAAA", `${session}x`]) {
    assert.equal(await status("/api/invoices", "POST", bad), 401, bad);
    assert.equal(await status("/settings", "GET", bad), 404, bad);
  }
});

test("an expired session is treated as no session", async () => {
  const expired = await mintSession(Date.now() - 15 * 24 * 60 * 60 * 1000);
  assert.equal(await status("/api/invoices", "POST", expired), 401);
  assert.equal(await status("/settings", "GET", expired), 404);
});

test("the refusal says what to do and leaks nothing", async () => {
  const response = await proxy(request("/api/invoices", "POST"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Sign in to make changes." });
});

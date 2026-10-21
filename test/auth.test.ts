// The session token is the only thing between the public internet and every
// write in this app, so it gets the same treatment as the key sealing.
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SETTINGS_MASTER_KEY = Buffer.alloc(32, 3).toString("base64");
process.env.ADMIN_PASSWORD = "a-long-enough-test-password";

const { mintSession, isValidSession, isCorrectPassword, sessionCookie, clearedSessionCookie } =
  await import("../lib/auth.ts");

const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

test("a freshly minted session is valid", async () => {
  assert.equal(await isValidSession(await mintSession(NOW), NOW), true);
});

test("a session expires", async () => {
  const token = await mintSession(NOW);
  assert.equal(await isValidSession(token, NOW + 13 * DAY), true);
  assert.equal(await isValidSession(token, NOW + 15 * DAY), false);
});

test("an edited expiry does not extend a session", async () => {
  const token = await mintSession(NOW);
  const signature = token.slice(token.indexOf(".") + 1);
  const farFuture = Math.floor(NOW / 1000) + 365 * 24 * 60 * 60;

  // The expiry is what gets signed, so moving it invalidates the signature.
  assert.equal(
    await isValidSession(`${farFuture}.${signature}`, NOW + 15 * DAY),
    false,
  );
});

test("junk is not a session", async () => {
  for (const token of [
    undefined,
    "",
    ".",
    "abc",
    "abc.def",
    "1790000000",
    "1790000000.",
    ".signature",
    "-1790000000.aaaa",
    "1790000000.not base64!!",
  ]) {
    assert.equal(await isValidSession(token, NOW), false, `accepted ${token}`);
  }
});

test("a session signed with a different master key is refused", async () => {
  const token = await mintSession(NOW);
  const original = process.env.SETTINGS_MASTER_KEY;

  process.env.SETTINGS_MASTER_KEY = Buffer.alloc(32, 4).toString("base64");
  assert.equal(await isValidSession(token, NOW), false);

  process.env.SETTINGS_MASTER_KEY = original;
  assert.equal(await isValidSession(token, NOW), true);
});

test("changing the password ends every existing session", async () => {
  // Sign out only clears one browser's cookie. Changing the password is the way
  // to cut off a copied cookie, so a token has to stop working when it changes.
  const token = await mintSession(NOW);
  const original = process.env.ADMIN_PASSWORD;

  try {
    process.env.ADMIN_PASSWORD = "a-different-long-test-password";
    assert.equal(await isValidSession(token, NOW), false);
    assert.equal(await isValidSession(await mintSession(NOW), NOW), true);
  } finally {
    process.env.ADMIN_PASSWORD = original;
  }
  assert.equal(await isValidSession(token, NOW), true);
});

test("a session cannot be checked without a password set", async () => {
  const token = await mintSession(NOW);
  const original = process.env.ADMIN_PASSWORD;
  try {
    delete process.env.ADMIN_PASSWORD;
    await assert.rejects(isValidSession(token, NOW), /ADMIN_PASSWORD/);
  } finally {
    process.env.ADMIN_PASSWORD = original;
  }
});

test("the password check accepts only the exact password", async () => {
  assert.equal(await isCorrectPassword("a-long-enough-test-password"), true);
  for (const wrong of [
    "",
    "a",
    "a-long-enough-test-passwor",
    "a-long-enough-test-password ",
    "A-long-enough-test-password",
    "a-long-enough-test-password-and-more",
  ]) {
    assert.equal(await isCorrectPassword(wrong), false, `accepted "${wrong}"`);
  }
});

test("signing out empties and expires the session cookie", () => {
  const cleared = clearedSessionCookie();

  // The same cookie, emptied and expired at once. Anything else leaves a
  // session someone still holds working, since the cookie is httpOnly and the
  // browser cannot clear it itself.
  assert.equal(cleared.name, sessionCookie.name);
  assert.equal(cleared.value, "");
  assert.equal(cleared.options.maxAge, 0);
  assert.equal(cleared.options.httpOnly, true);
  assert.equal(cleared.options.path, sessionCookie.options.path);
});

// --- the read-only demo session (#233) --------------------------------------

const { mintDemoSession, sessionRole, canRead } = await import("../lib/auth.ts");

test("a demo session reads but is not the owner", async () => {
  const demo = await mintDemoSession(NOW);
  assert.equal(await sessionRole(demo, NOW), "demo");
  assert.equal(await canRead(demo, NOW), true);
  // Every existing write guard asks isValidSession, so it has to stay owner only.
  assert.equal(await isValidSession(demo, NOW), false);
  assert.equal(await sessionRole(await mintSession(NOW), NOW), "owner");
});

test("the role cannot be edited in or out of a token", async () => {
  const demo = await mintDemoSession(NOW);
  const owner = await mintSession(NOW);
  // Stripping the marker off a demo token must not yield an owner session.
  assert.equal(await sessionRole(demo.slice("demo.".length), NOW), null);
  // Nor can an owner token be relabelled, which would be harmless but means
  // the role is not actually covered by the signature.
  assert.equal(await sessionRole(`demo.${owner}`, NOW), null);
  assert.equal(await sessionRole("demo.", NOW), null);
  assert.equal(await sessionRole("demo.garbage", NOW), null);
});

test("a demo session expires and ends with a password change like any other", async () => {
  const demo = await mintDemoSession(NOW);
  assert.equal(await sessionRole(demo, NOW + 15 * DAY), null);
  const saved = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "a-different-long-password";
  try {
    assert.equal(await sessionRole(demo, NOW), null);
  } finally {
    process.env.ADMIN_PASSWORD = saved;
  }
});

// A cross-site form can POST to the demo route with the owner's cookie attached
// on a top level navigation. Without this check that silently swaps the owner's
// session for a read only one. Kimi K2.5 review on #251.
const { demoSessionFor } = await import("../lib/auth.ts");

test("a signed in owner is never swapped onto a demo session", async () => {
  assert.equal(await demoSessionFor(await mintSession(NOW), NOW), null);

  const stranger = await demoSessionFor(undefined, NOW);
  assert.equal(await sessionRole(stranger!, NOW), "demo");
  const expiredDemo = await demoSessionFor(await mintDemoSession(NOW - 30 * DAY), NOW);
  assert.equal(await sessionRole(expiredDemo!, NOW), "demo");
});

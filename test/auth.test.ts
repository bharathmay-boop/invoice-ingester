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

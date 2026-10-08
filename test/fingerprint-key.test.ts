// The login source pseudonym is keyed, and the key it is keyed with must not be
// the key that seals provider API keys. One secret used for two primitives is
// what lets a weakness in one become a weakness in the other (#214).
//
// Pure: no database, so this runs on a clean checkout.
import assert from "node:assert/strict";
import { after, test } from "node:test";

// A fixed test key, not a secret: 32 bytes of 0x07 so the expectations below are
// about derivation rather than about any particular value.
const MASTER = Buffer.alloc(32, 7).toString("base64");
process.env.SETTINGS_MASTER_KEY = MASTER;
process.env.VERCEL = "1";

const { fingerprint, fingerprintKey } = await import("../lib/rate-limit.ts");
const { pool } = await import("../lib/db.ts");

after(() => pool.end());

const from = (ip: string) =>
  new Request("https://example.test/login", { headers: { "x-forwarded-for": ip } });

test("the HMAC key is derived, not the sealing key itself", () => {
  const derived = fingerprintKey();
  assert.equal(derived.length, 32, "still a 256 bit key");
  assert.notEqual(
    derived.toString("base64"),
    MASTER,
    "using the master key directly is the bug this test exists for",
  );
});

test("derivation is deterministic, so a fingerprint is stable across restarts", () => {
  assert.equal(fingerprintKey().toString("hex"), fingerprintKey().toString("hex"));
  assert.equal(fingerprint(from("203.0.113.9")), fingerprint(from("203.0.113.9")));
});

test("a different master key gives a different subkey", () => {
  const before = fingerprintKey().toString("hex");
  process.env.SETTINGS_MASTER_KEY = Buffer.alloc(32, 8).toString("base64");
  try {
    assert.notEqual(fingerprintKey().toString("hex"), before);
  } finally {
    process.env.SETTINGS_MASTER_KEY = MASTER;
  }
});

test("two addresses stay in two buckets", () => {
  // The whole point of the fingerprint: one source being rate limited must not
  // spend another source's allowance.
  assert.notEqual(fingerprint(from("203.0.113.9")), fingerprint(from("198.51.100.4")));
});

test("the fingerprint reveals nothing about the address", () => {
  const ip = "203.0.113.9";
  const printed = fingerprint(from(ip));
  assert.ok(!printed.includes(ip));
  assert.equal(printed.length, 32);
});

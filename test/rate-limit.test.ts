// The password gate is the only thing between the open internet and every
// write, so its limiter gets the same treatment as the key sealing.
//
// Runs in a throwaway schema built from the real migration, so it cannot touch
// a live attempt log. Skipped without a database, like the other store tests.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const configured = Boolean(process.env.DATABASE_URL && process.env.SETTINGS_MASTER_KEY);
const skip = configured ? false : "no DATABASE_URL and SETTINGS_MASTER_KEY";

const SCHEMA = `test_rl_${Math.random().toString(36).slice(2, 10)}`;

// Set before the pool is constructed, so every connection is already pointed at
// the throwaway schema. Setting it on the pool's connect event instead is a
// race: the pool can hand out a client and run a query on it before that SET
// lands, which silently puts the write in public.
//
// Neon's pooler refuses search_path in the startup packet, so tests use the
// direct connection, the same one migrations use and for the same reason.
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

const db = configured ? await import("../lib/db.ts") : null;
const limiter = configured ? await import("../lib/rate-limit.ts") : null;

before(async () => {
  if (!db) return;
  // Created through a connection that is not yet pinned to it.
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  for (const file of ["007_login_attempt.sql", "008_login_attempt_at.sql"]) {
    const migration = fileURLToPath(new URL(`../db/migrations/${file}`, import.meta.url));
    await db.query(await readFile(migration, "utf8"));
  }
});

after(async () => {
  if (!db) return;
  await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await db.pool.end();
});

/** A request as the route sees it: the address arrives in a forwarded header. */
const from = (ip: string) =>
  new Request("https://example.test/api/session", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });

test("the tests are isolated from real data", { skip }, async () => {
  const rows = await db!.query<{ schema: string }>("SELECT current_schema() AS schema");
  assert.equal(rows[0].schema, SCHEMA);
});

test("eight attempts are allowed, the ninth is not", { skip }, async () => {
  const ip = "198.51.100.10";
  for (let i = 1; i <= 8; i += 1) {
    const limit = await limiter!.registerLoginAttempt(from(ip));
    assert.equal(limit.allowed, true, `attempt ${i} should have been allowed`);
  }

  const ninth = await limiter!.registerLoginAttempt(from(ip));
  assert.equal(ninth.allowed, false);
  assert.ok(!ninth.allowed && ninth.retryAfterSeconds > 0);
  // Tells the caller when to come back rather than just refusing.
  assert.ok(!ninth.allowed && ninth.retryAfterSeconds <= 15 * 60);
});

test("a refused attempt does not extend the lockout", { skip }, async () => {
  const ip = "198.51.100.11";
  for (let i = 0; i < 8; i += 1) await limiter!.registerLoginAttempt(from(ip));

  await limiter!.registerLoginAttempt(from(ip));
  await limiter!.registerLoginAttempt(from(ip));

  // Refusals are not recorded, so hammering a locked gate cannot push the
  // window further out each time.
  const rows = await db!.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM login_attempt WHERE source = (SELECT source FROM login_attempt GROUP BY source ORDER BY count(*) DESC LIMIT 1)",
  );
  assert.equal(rows[0].n, 8);
});

test("one source cannot lock out another", { skip }, async () => {
  const noisy = "198.51.100.12";
  for (let i = 0; i < 9; i += 1) await limiter!.registerLoginAttempt(from(noisy));

  const quiet = await limiter!.registerLoginAttempt(from("198.51.100.13"));
  assert.equal(quiet.allowed, true);
});

test("a correct password clears that source and no other", { skip }, async () => {
  const mine = "198.51.100.14";
  const theirs = "198.51.100.15";

  for (let i = 0; i < 4; i += 1) await limiter!.registerLoginAttempt(from(mine));
  for (let i = 0; i < 4; i += 1) await limiter!.registerLoginAttempt(from(theirs));

  await limiter!.clearLoginAttempts(from(mine));

  // Mine is clear, so the full allowance is back.
  for (let i = 1; i <= 8; i += 1) {
    assert.equal((await limiter!.registerLoginAttempt(from(mine))).allowed, true, `after clearing, attempt ${i}`);
  }
  assert.equal((await limiter!.registerLoginAttempt(from(mine))).allowed, false);

  // Theirs was untouched: four already used, so four remain.
  for (let i = 1; i <= 4; i += 1) {
    assert.equal((await limiter!.registerLoginAttempt(from(theirs))).allowed, true, `theirs, attempt ${i}`);
  }
  assert.equal((await limiter!.registerLoginAttempt(from(theirs))).allowed, false);
});

test("a burst from one source cannot exceed the allowance", { skip }, async () => {
  const ip = "198.51.100.16";

  // The failure this replaced: counting and recording as two statements let
  // every request in a burst read the same low count and all be admitted.
  const results = await Promise.all(
    Array.from({ length: 20 }, () => limiter!.registerLoginAttempt(from(ip))),
  );

  assert.equal(results.filter((r) => r.allowed).length, 8);
  assert.equal(results.filter((r) => !r.allowed).length, 12);
});

test("the index the sweep needs exists", { skip }, async () => {
  // The sweep filters on `at` alone. Without this index it scans the whole
  // table on every login that happens to sweep.
  const rows = await db!.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes
     WHERE tablename = 'login_attempt' AND schemaname = current_schema()`,
  );
  assert.ok(
    rows.some((r) => /\(at\)/.test(r.indexdef)),
    `no index usable by the retention sweep: ${rows.map((r) => r.indexdef).join("; ")}`,
  );
});

test("the stored source is keyed, not a bare digest of the address", { skip }, async () => {
  const { createHash } = await import("node:crypto");
  const ip = "198.51.100.17";
  await limiter!.registerLoginAttempt(from(ip));

  const rows = await db!.query<{ source: string }>(
    "SELECT DISTINCT source FROM login_attempt",
  );
  const stored = rows.map((r) => r.source);

  // An unkeyed digest would be recoverable by hashing all of IPv4, so the
  // plain SHA-256 of the address must not appear.
  const bare = createHash("sha256").update(ip).digest("base64url").slice(0, 32);
  assert.equal(stored.includes(bare), false);
  // And the address itself is obviously not stored.
  assert.equal(stored.some((s) => s.includes(ip)), false);
});

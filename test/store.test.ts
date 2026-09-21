// Database backed coverage for the settings and secret store. Without this the
// suite stays green through a renamed column, a wrong placeholder, a broken
// upsert or a JSON serialisation change, none of which the crypto tests touch.
//
// Everything runs in a throwaway schema created per run and dropped at the end,
// built from the real migration file. `npm test` therefore cannot touch a saved
// API key, and two runs against the same database cannot collide.
//
// Skipped when there is no database configured, so `npm test` still runs on a
// clean checkout. Run `vercel env pull` to get one.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const configured = Boolean(
  process.env.DATABASE_URL && process.env.SETTINGS_MASTER_KEY,
);
const skip = configured
  ? false
  : "no DATABASE_URL and SETTINGS_MASTER_KEY, run `vercel env pull`";

const store = configured ? await import("../lib/settings/store.ts") : null;
const db = configured ? await import("../lib/db.ts") : null;

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
const KEY = "sk-test-" + "x".repeat(24) + "-4d7e";

if (db) {
  // Attached before the pool has opened a single connection, so every client it
  // hands out is already pointed at the throwaway schema. A schema that does not
  // exist yet in search_path is ignored rather than an error, which is what makes
  // this safe to set before creating it.
  db.pool.on("connect", (client) => {
    client.query(`SET search_path TO ${SCHEMA}, public`);
  });
}

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA ${SCHEMA}`);
  const migration = fileURLToPath(
    new URL("../db/migrations/002_settings.sql", import.meta.url),
  );
  await db.query(await readFile(migration, "utf8"));
});

after(async () => {
  if (!db) return;
  await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await db.pool.end();
});

test("the tests are isolated from real data", { skip }, async () => {
  const rows = await db!.query<{ schema: string }>(
    "SELECT current_schema() AS schema",
  );
  assert.equal(rows[0].schema, SCHEMA, "tests must not run against the live schema");
});

test("a setting round trips, including nested JSON", { skip }, async () => {
  const value = { link: 0.85, suggest: 0.6, note: "tolerance in rupees" };
  await store!.setSetting("match_thresholds", value);
  assert.deepEqual(await store!.getSetting("match_thresholds"), value);
});

test("writing a setting twice updates rather than duplicating", { skip }, async () => {
  await store!.setSetting("rounding_tolerance", { rupees: 1 });
  await store!.setSetting("rounding_tolerance", { rupees: 2 });
  assert.deepEqual(await store!.getSetting("rounding_tolerance"), { rupees: 2 });
  const rows = await db!.query<{ n: number }>(
    "SELECT count(*)::int n FROM setting WHERE key = $1",
    ["rounding_tolerance"],
  );
  assert.equal(rows[0].n, 1);
});

test("a missing setting is null, not a throw", { skip }, async () => {
  assert.equal(await store!.getSetting("never_written"), null);
});

test("a secret is stored sealed and comes back whole", { skip }, async () => {
  await store!.setSecret("anthropic_api_key", KEY);
  assert.equal(await store!.getSecret("anthropic_api_key"), KEY);

  const rows = await db!.query<{ sealed: string }>(
    "SELECT sealed FROM secret WHERE name = $1",
    ["anthropic_api_key"],
  );
  assert.equal(rows[0].sealed.includes(KEY), false, "the key is in the table in clear");
  assert.equal(rows[0].sealed.startsWith("v1."), true);
});

test("only the mask is exposed", { skip }, async () => {
  await store!.setSecret("anthropic_api_key", KEY);
  const status = await store!.describeSecret("anthropic_api_key");
  assert.deepEqual(status, { present: true, masked: `****${KEY.slice(-4)}` });
  assert.equal(JSON.stringify(status).includes(KEY.slice(0, 10)), false);

  assert.deepEqual(await store!.describeSecret("openrouter_api_key"), {
    present: false,
    masked: null,
  });
});

test("replacing a secret overwrites it", { skip }, async () => {
  await store!.setSecret("anthropic_api_key", KEY);
  const replacement = `${KEY}-second`;
  await store!.setSecret("anthropic_api_key", replacement);
  assert.equal(await store!.getSecret("anthropic_api_key"), replacement);

  const rows = await db!.query<{ n: number }>(
    "SELECT count(*)::int n FROM secret WHERE name = 'anthropic_api_key'",
  );
  assert.equal(rows[0].n, 1);
});

test("an empty key is refused before it reaches the table", { skip }, async () => {
  await assert.rejects(() => store!.setSecret("openrouter_api_key", "   "), /empty key/);
  assert.equal((await store!.describeSecret("openrouter_api_key")).present, false);
});

test("a deleted secret is gone and reads as absent", { skip }, async () => {
  await store!.setSecret("anthropic_api_key", KEY);
  await store!.deleteSecret("anthropic_api_key");
  assert.equal(await store!.getSecret("anthropic_api_key"), null);
  assert.deepEqual(await store!.describeSecret("anthropic_api_key"), {
    present: false,
    masked: null,
  });
});

test("a row moved to another name will not open", { skip }, async () => {
  await store!.deleteSecret("openrouter_api_key");
  await store!.setSecret("anthropic_api_key", KEY);
  await db!.query(
    "UPDATE secret SET name = 'openrouter_api_key' WHERE name = 'anthropic_api_key'",
  );
  await assert.rejects(() => store!.getSecret("openrouter_api_key"));
});

test("a key in the environment is local only", { skip }, async () => {
  const name = "openrouter_api_key" as const;
  const original = process.env.OPENROUTER_API_KEY;
  const LOCAL = "sk-or-local-only-key-000000000000000000007c4f";

  try {
    // An earlier test leaves a row under this name behind on purpose.
    await store!.deleteSecret(name);
    delete process.env.OPENROUTER_API_KEY;
    assert.equal((await store!.describeSecret(name)).present, false);

    process.env.OPENROUTER_API_KEY = LOCAL;
    assert.equal(await store!.getSecret(name), LOCAL);

    const status = await store!.describeSecret(name);
    assert.equal(status.present, true);
    // Says where it came from, or the page would claim nothing is set while
    // uploads quietly worked.
    assert.match(status.masked ?? "", /from \.env\.local/);
    assert.equal(status.masked?.includes(LOCAL.slice(0, 12)), false);

    // The whole point: never on a deployment.
    process.env.VERCEL = "1";
    assert.equal(await store!.getSecret(name), null);
    assert.equal((await store!.describeSecret(name)).present, false);
    delete process.env.VERCEL;

    // A key entered through settings wins, so the environment cannot shadow it.
    await store!.setSecret(name, "sk-or-saved-in-settings-0000000000000000beef");
    assert.equal((await store!.getSecret(name))?.endsWith("beef"), true);
    await store!.deleteSecret(name);
  } finally {
    delete process.env.VERCEL;
    if (original === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = original;
  }
});

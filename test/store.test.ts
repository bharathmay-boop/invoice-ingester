// Database backed coverage for the settings and secret store. Without this the
// suite stays green through a renamed column, a wrong placeholder, a broken
// upsert or a JSON serialisation change, none of which the crypto tests touch.
//
// Skipped when there is no database configured, so `npm test` still runs on a
// clean checkout. Run `vercel env pull` to get one.
import assert from "node:assert/strict";
import { after, test } from "node:test";

const configured = Boolean(
  process.env.DATABASE_URL && process.env.SETTINGS_MASTER_KEY,
);
const skip = configured
  ? false
  : "no DATABASE_URL and SETTINGS_MASTER_KEY, run `vercel env pull`";

const store = configured ? await import("../lib/settings/store.ts") : null;
const db = configured ? await import("../lib/db.ts") : null;

// Rows are named per run so a failed run cannot poison the next one, and so two
// runs against the same database cannot collide.
const run = Math.random().toString(36).slice(2, 8);
const SETTING = `test_${run}`;
const KEY = `sk-test-${run}-${"x".repeat(20)}-4d7e`;

after(async () => {
  if (!db) return;
  await db.query("DELETE FROM setting WHERE key LIKE 'test_%'");
  await db.query(
    "DELETE FROM secret WHERE name IN ('anthropic_api_key','openrouter_api_key')",
  );
  await db.pool.end();
});

test("a setting round trips, including nested JSON", { skip }, async () => {
  const value = { link: 0.85, suggest: 0.6, note: "tolerance in rupees" };
  await store!.setSetting(SETTING, value);
  assert.deepEqual(await store!.getSetting(SETTING), value);
});

test("writing a setting twice updates rather than duplicating", { skip }, async () => {
  await store!.setSetting(SETTING, { link: 0.9 });
  assert.deepEqual(await store!.getSetting(SETTING), { link: 0.9 });
  const rows = await db!.query<{ n: number }>(
    "SELECT count(*)::int n FROM setting WHERE key = $1",
    [SETTING],
  );
  assert.equal(rows[0].n, 1);
});

test("a missing setting is null, not a throw", { skip }, async () => {
  assert.equal(await store!.getSetting(`test_${run}_absent`), null);
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
  await store!.setSecret("anthropic_api_key", KEY);
  await db!.query(
    "UPDATE secret SET name = 'openrouter_api_key' WHERE name = 'anthropic_api_key'",
  );
  await assert.rejects(() => store!.getSecret("openrouter_api_key"));
});

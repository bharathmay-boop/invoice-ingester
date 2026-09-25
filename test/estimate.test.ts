// What a batch is said to cost before it spends anything. The figures come
// from the catalogue price of the configured model, so a wrong one here is a
// promise the bill will not keep.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
process.env.SETTINGS_MASTER_KEY ??= Buffer.alloc(32, 11).toString("base64");

const db = configured ? await import("../lib/db.ts") : null;
const store = configured ? await import("../lib/settings/store.ts") : null;
const estimate = configured ? await import("../lib/extract/estimate.ts") : null;

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`CREATE TABLE setting (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now())`);
});

after(async () => {
  if (!db) return;
  await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await db.pool.end();
});

/** A catalogue cache holding one priced model, as the settings page writes it. */
async function catalogue(id: string, prompt: number, completion: number) {
  await store!.setSetting("openrouter_models_cache", {
    at: Date.now(),
    models: [{ id, name: id, cost: 0, prices: { prompt, completion }, recommended: null }],
  });
  await store!.setSetting("openrouter_model", id);
}

test("a batch is priced from the model actually configured", { skip }, async () => {
  // $1 per million in, $10 per million out.
  await catalogue("vendor/priced", 0.000001, 0.00001);
  const result = await estimate!.estimateBatch("openrouter");

  assert.equal(result.model, "vendor/priced");
  // The low end: 1200 in, 250 out.
  assert.equal(result.low, 1200 * 0.000001 + 250 * 0.00001);
  // The high end is higher, and both are real numbers rather than a guess.
  assert.ok(result.high !== null && result.low !== null && result.high > result.low);
});

test("a model with no known price says so rather than inventing one", { skip }, async () => {
  await store!.setSetting("openrouter_models_cache", { at: Date.now(), models: [] });
  await store!.setSetting("openrouter_model", "vendor/unlisted");

  const result = await estimate!.estimateBatch("openrouter");
  assert.equal(result.low, null);
  assert.equal(result.high, null);
});

test("the Claude path is priced without the OpenRouter catalogue", { skip }, async () => {
  // Claude is called directly, so its price is not in that catalogue at all.
  const result = await estimate!.estimateBatch("anthropic");
  assert.equal(result.model, "claude-opus-5");
  assert.ok(result.low !== null && result.low > 0, "a known model has a known price");
});

test("the confirm threshold is a setting, and never zero", { skip }, async () => {
  assert.equal((await estimate!.estimateBatch("anthropic")).confirmAt, estimate!.DEFAULT_BATCH_CONFIRM_AT);

  await store!.setSetting(estimate!.BATCH_CONFIRM_SETTING, 20);
  assert.equal((await estimate!.estimateBatch("anthropic")).confirmAt, 20);

  // A threshold of zero would ask about every single file, including one.
  await store!.setSetting(estimate!.BATCH_CONFIRM_SETTING, 0);
  assert.equal((await estimate!.estimateBatch("anthropic")).confirmAt, 1);
});

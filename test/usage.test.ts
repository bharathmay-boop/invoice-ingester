// The spend record, in its own throwaway schema. A wrong sum here would be a
// wrong figure about real money, and the panel in settings would show it
// without anything to contradict it.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
// No key, so the PostHog half of recordExtraction is a no-op and the test
// covers the record that has to be right.
delete process.env.NEXT_PUBLIC_POSTHOG_KEY;

const db = configured ? await import("../lib/db.ts") : null;
const usage = configured ? await import("../lib/usage.ts") : null;

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  const file = fileURLToPath(new URL("../db/migrations/011_extraction_event.sql", import.meta.url));
  await db.query(await readFile(file, "utf8"));
});

after(async () => {
  if (!db) return;
  await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await db.pool.end();
});

const call = (over: Partial<Parameters<NonNullable<typeof usage>["recordExtraction"]>[0]> = {}) => ({
  provider: "openrouter",
  model: "test/model",
  inputTokens: 1000,
  outputTokens: 500,
  pages: 2,
  invoices: 1,
  durationMs: 1200,
  outcome: "extracted" as const,
  ...over,
});

test("a call is recorded whatever it cost, and the totals add up", { skip }, async () => {
  await usage!.recordExtraction(call());
  await usage!.recordExtraction(call({ invoices: 3 }));
  await usage!.recordExtraction(call({ outcome: "failed", invoices: 0, inputTokens: null, outputTokens: null }));

  const total = await usage!.usageSince(new Date(Date.now() - 60_000));
  assert.equal(total.calls, 3);
  assert.equal(total.invoices, 4);
  assert.equal(total.failures, 1);
  // No catalogue cache in this schema, so nothing can be priced. Unknown is
  // counted as unknown rather than folded into the total as zero.
  assert.equal(total.unpriced, 3);
  assert.equal(total.cost, 0);
});

test("only calls inside the window count", { skip }, async () => {
  const future = await usage!.usageSince(new Date(Date.now() + 60_000));
  assert.equal(future.calls, 0);
  assert.equal(future.cost, 0);
});

test("a failure to record never throws at the caller", { skip }, async () => {
  await db!.query("ALTER TABLE extraction_event RENAME TO extraction_event_hidden");
  try {
    await usage!.recordExtraction(call());
  } finally {
    await db!.query("ALTER TABLE extraction_event_hidden RENAME TO extraction_event");
  }
});

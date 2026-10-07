// The currency set, and whether the database still agrees with it.
//
// The set used to be written out four times: a union in lib/format.ts, a zod
// enum in each reader, and a CHECK constraint in migration 014. Nothing failed
// when only three of the four were edited, which is how #191 and #192 happened.
//
// The database half of this is the part worth having. The code can be made to
// agree with itself by a type, but nothing in TypeScript can see a CHECK
// constraint. So the last test applies every migration to a throwaway schema
// and compares the constraint it ends up with against CURRENCIES. Add a
// currency to the code without a migration and that test fails here rather
// than failing a customer's save.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { CURRENCIES, CURRENCY_LIST, CURRENCY_NAMES, isCurrency } from "../lib/money/currencies.ts";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

const db = configured ? await import("../lib/db.ts") : null;

test("every currency has a name to show", () => {
  for (const code of CURRENCIES) {
    assert.ok(CURRENCY_NAMES[code], `${code} has no display name`);
  }
  assert.equal(Object.keys(CURRENCY_NAMES).length, CURRENCIES.length);
});

test("isCurrency accepts the set and nothing else", () => {
  for (const code of CURRENCIES) assert.equal(isCurrency(code), true);
  // Lowercase is not a currency as far as a boundary is concerned. Normalising
  // is the schema's job, in lib/money/schema.ts, and a guard that quietly
  // accepted "inr" would hide exactly the bug #191 is about.
  assert.equal(isCurrency("inr"), false);
  assert.equal(isCurrency("JPY"), false);
  assert.equal(isCurrency(""), false);
  assert.equal(isCurrency(null), false);
  assert.equal(isCurrency(undefined), false);
});

test("the prompt list names every currency", () => {
  for (const code of CURRENCIES) {
    assert.ok(CURRENCY_LIST.includes(code), `the prompt would never mention ${code}`);
  }
});

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  const dir = new URL("../db/migrations/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of files) {
    await db.query(await readFile(fileURLToPath(new URL(name, dir)), "utf8"));
  }
});

after(async () => {
  if (!db) return;
  await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await db.pool.end();
});

test("the tests are isolated from real data", { skip }, async () => {
  const rows = await db!.query<{ schema: string }>("SELECT current_schema() AS schema");
  assert.equal(rows[0].schema, SCHEMA, "tests must not run against the live schema");
});

test("the database constraint and CURRENCIES are the same set", { skip }, async () => {
  const rows = await db!.query<{ def: string }>(
    `SELECT pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = current_schema() AND c.conname = 'invoice_currency_check'`,
  );

  assert.equal(rows.length, 1, "invoice.currency has no named CHECK constraint");

  // Postgres renders the check as `= ANY (ARRAY['INR'::text, ...])`, so the
  // quoted literals are the accepted set whichever way the migration spelled it.
  const accepted = [...rows[0].def.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    [...accepted].sort(),
    [...CURRENCIES].sort(),
    "the database accepts a different set of currencies from the code",
  );
});

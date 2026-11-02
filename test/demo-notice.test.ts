// The in-app notice said "these are made up invoices" whatever the database
// held, so it would still say so over real ones. It is now worked out from
// whether any real invoice exists, and vanishes once one is confirmed (#158).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

const db = configured ? await import("../lib/db.ts") : null;
const notice = configured ? await import("../lib/demo/notice.ts") : null;

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`
    CREATE TABLE invoice (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      status text NOT NULL DEFAULT 'confirmed',
      is_demo boolean NOT NULL DEFAULT false
    )`);
});

after(async () => {
  if (!db) return;
  await db.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
  await db.pool.end();
});

test("the notice shows over demo data and vanishes once a real invoice is confirmed", { skip }, async () => {
  assert.equal(await notice!.onlyDemoData(), true, "an empty database is not real data either");
  await db!.query("INSERT INTO invoice (is_demo) VALUES (true)");
  assert.equal(await notice!.onlyDemoData(), true);
  await db!.query("INSERT INTO invoice (is_demo, status) VALUES (false, 'needs_review')");
  assert.equal(await notice!.onlyDemoData(), true, "one waiting for review is not confirmed yet");
  await db!.query("INSERT INTO invoice (is_demo, status) VALUES (false, 'confirmed')");
  assert.equal(await notice!.onlyDemoData(), false);
});

test("the notice is one clause, with no repository link", () => {
  const component = readFileSync("app/demo-notice.tsx", "utf8");
  // The shared ui.tsx stays free of server-only imports (Kimi K2.5, #288).
  assert.ok(!readFileSync("app/ui.tsx", "utf8").includes("lib/demo/notice"), "ui.tsx imports a server-only read");
  assert.match(component, /onlyDemoData\(\)/);
  assert.ok(!component.slice(0, 600).includes("github.com"), "the link is back");
  assert.ok(!/Nothing here came from a model/.test(component), "the old claim is back");
});

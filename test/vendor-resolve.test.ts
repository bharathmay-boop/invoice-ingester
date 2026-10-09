// Where a contract can end up on the wrong supplier, against real Postgres.
//
// The unique index is the behaviour being tested, so it is created here as the
// migrations create it. `vendor.normalized_name` used to be built with the item
// normaliser, which drops words like "quality" and sorts the rest, so two
// suppliers a person would never confuse shared one key and a save silently
// landed on the wrong one (#217). Now two rows share a key only when the
// printed names are the same words.
import assert from "node:assert/strict";
import type pg from "pg";
import { after, before, beforeEach, test } from "node:test";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

const db = configured ? await import("../lib/db.ts") : null;
const resolve = configured ? await import("../lib/vendors/resolve.ts") : null;

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`
    CREATE TABLE vendor (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tax_id text,
      tax_id_kind text,
      normalized_tax_id text,
      name text NOT NULL,
      normalized_name text NOT NULL,
      address text,
      normalized_address text NOT NULL DEFAULT ''
    )`);
  await db.query(
    `CREATE UNIQUE INDEX vendor_name_address ON vendor (normalized_name, normalized_address)
     WHERE tax_id IS NULL`,
  );
  await db.query(
    `CREATE UNIQUE INDEX vendor_tax ON vendor (tax_id_kind, normalized_tax_id)
     WHERE tax_id IS NOT NULL`,
  );
});

beforeEach(async () => {
  if (db) await db.query("DELETE FROM vendor");
});

after(async () => {
  if (db) {
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db.pool.end();
  }
});

function input(name: string, over: Partial<{ address: string; taxId: string; taxIdKind: string }> = {}) {
  return { name, address: "", taxId: "", taxIdKind: "", ...over };
}

async function withClient<T>(run: (client: pg.PoolClient) => Promise<T>) {
  const client = await db!.pool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
  }
}

const save = (i: ReturnType<typeof input>) =>
  withClient((c) => resolve!.resolveNewContractVendor(c, i));

async function named(id: string) {
  const rows = await db!.query<{ name: string }>("SELECT name FROM vendor WHERE id = $1", [id]);
  return rows[0].name;
}

test("a filler word makes a different supplier, not the same one", { skip }, async () => {
  const first = await save(input("Jain Traders"));
  const second = await save(input("Jain Quality Traders"));
  assert.notEqual(second, first);
  assert.equal(await named(first), "Jain Traders");
});

test("word order alone makes a different supplier", { skip }, async () => {
  assert.notEqual(await save(input("Traders Jain")), await save(input("Jain Traders")));
});

test("two companies written in kanji are two suppliers", { skip }, async () => {
  assert.notEqual(await save(input("三井 Ltd")), await save(input("三菱 Ltd")));
});

test("the same supplier spelled differently is reused and takes the new spelling", { skip }, async () => {
  const first = await save(input("acme traders pvt ltd"));
  const second = await save(input("Acme Traders Pvt. Ltd."));
  assert.equal(second, first);
  assert.equal(await named(first), "Acme Traders Pvt. Ltd.");
});

test("a different address keeps two suppliers apart", { skip }, async () => {
  const a = await save(input("Jain Traders", { address: "12 MG Road" }));
  const b = await save(input("Jain Traders", { address: "9 Linking Road" }));
  assert.notEqual(a, b);
});

test("addresses in another script do not all collapse to one", { skip }, async () => {
  const a = await save(input("Mitsui", { address: "東京都千代田区" }));
  const b = await save(input("Mitsui", { address: "大阪府大阪市" }));
  assert.notEqual(a, b);
});

test("a tax registration is identity, so a conflict on it is the same supplier", { skip }, async () => {
  const first = await save(input("Jain Traders", { taxId: "29ABCDE1234F1Z5", taxIdKind: "gstin" }));
  const second = await save(
    input("Jain Quality Traders", { taxId: "29 abcde 1234 f1z5", taxIdKind: "gstin" }),
  );
  assert.equal(second, first);
  assert.equal(await named(first), "Jain Quality Traders");
});

// The backfill: rows saved under the old key are brought onto the new one, so
// the next invoice from that supplier finds the row instead of making a second.
test("old-style keys are rewritten, and a second run changes nothing", { skip }, async () => {
  const rekey = await import("../lib/vendors/rekey.ts");
  await db!.query(
    `INSERT INTO vendor (name, normalized_name, address, normalized_address) VALUES
       ('Jain Quality Traders', 'jain traders', NULL, ''),
       ('Traders Jain', 'jain traders x', NULL, ''),
       ('\u4e09\u4e95 Ltd', 'ltd', '\u6771\u4eac\u90fd', '')`,
  );
  const inTransaction = (c: pg.PoolClient) =>
    c.query("BEGIN").then(() => rekey.rekeyVendors(c)).then(async (r) => (await c.query("COMMIT"), r));
  const first = await withClient(inTransaction);
  assert.equal(first.updated, 3);
  assert.deepEqual(first.collisions, []);
  const keys = await db!.query<{ normalized_name: string; normalized_address: string }>(
    "SELECT normalized_name, normalized_address FROM vendor ORDER BY name",
  );
  assert.deepEqual(
    keys.map((k) => k.normalized_name).sort(),
    ["jain quality traders", "traders jain", "\u4e09\u4e95 ltd"].sort(),
  );
  assert.ok(keys.some((k) => k.normalized_address === "\u6771\u4eac\u90fd"));
  const second = await withClient(inTransaction);
  assert.equal(second.updated, 0);
});

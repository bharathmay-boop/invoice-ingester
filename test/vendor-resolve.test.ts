// Where a contract can end up on the wrong supplier, against real Postgres.
//
// The unique index is the behaviour being tested, so it is created here as the
// migrations create it. `vendor.normalized_name` is built with the item
// normaliser, which drops words like "quality" and sorts the rest, so two
// suppliers a person would never confuse share one key. What the resolver does
// with that conflict is the whole point: reuse when the printed names agree,
// refuse and name the existing supplier when they do not.
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

async function named(id: string) {
  const rows = await db!.query<{ name: string }>("SELECT name FROM vendor WHERE id = $1", [id]);
  return rows[0].name;
}

test("a genuinely new supplier is created", { skip }, async () => {
  const got = await withClient((c) => resolve!.resolveNewContractVendor(c, input("Oakridge Paper Co")));
  assert.equal(got.ok, true);
  assert.equal(await named((got as { id: string }).id), "Oakridge Paper Co");
});

test("a filler word is not enough to reuse an existing supplier", { skip }, async () => {
  const first = await withClient((c) => resolve!.resolveNewContractVendor(c, input("Jain Traders")));
  assert.equal(first.ok, true);

  const second = await withClient((c) =>
    resolve!.resolveNewContractVendor(c, input("Jain Quality Traders")),
  );
  assert.equal(second.ok, false);
  const message = (second as { message: string }).message;
  assert.match(message, /Jain Traders/);
  assert.match(message, /Jain Quality Traders/);

  // The refusal leaves the existing supplier exactly as it was.
  assert.equal(await named((first as { id: string }).id), "Jain Traders");
  const all = await db!.query<{ n: string }>("SELECT count(*)::int::text AS n FROM vendor");
  assert.equal(all[0].n, "1");
});

test("the same supplier spelled differently is reused and takes the new spelling", { skip }, async () => {
  const first = await withClient((c) =>
    resolve!.resolveNewContractVendor(c, input("acme traders pvt ltd")),
  );
  const second = await withClient((c) =>
    resolve!.resolveNewContractVendor(c, input("Acme Traders Pvt. Ltd.")),
  );
  assert.equal(second.ok, true);
  assert.equal((second as { id: string }).id, (first as { id: string }).id);
  assert.equal(await named((first as { id: string }).id), "Acme Traders Pvt. Ltd.");
});

test("word order alone does not make two suppliers one", { skip }, async () => {
  await withClient((c) => resolve!.resolveNewContractVendor(c, input("Traders Jain")));
  const second = await withClient((c) => resolve!.resolveNewContractVendor(c, input("Jain Traders")));
  assert.equal(second.ok, false);
});

test("a different address keeps two suppliers apart", { skip }, async () => {
  const first = await withClient((c) =>
    resolve!.resolveNewContractVendor(c, input("Jain Traders", { address: "12 MG Road" })),
  );
  const second = await withClient((c) =>
    resolve!.resolveNewContractVendor(c, input("Jain Quality Traders", { address: "9 Linking Road" })),
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual((second as { id: string }).id, (first as { id: string }).id);
});

test("a tax registration is identity, so a conflict on it is the same supplier", { skip }, async () => {
  const first = await withClient((c) =>
    resolve!.resolveNewContractVendor(c, input("Jain Traders", { taxId: "29ABCDE1234F1Z5", taxIdKind: "gstin" })),
  );
  const second = await withClient((c) =>
    resolve!.resolveNewContractVendor(c, input("Jain Quality Traders", { taxId: "29 abcde 1234 f1z5", taxIdKind: "gstin" })),
  );
  assert.equal(second.ok, true);
  assert.equal((second as { id: string }).id, (first as { id: string }).id);
  assert.equal(await named((first as { id: string }).id), "Jain Quality Traders");
});

// getVendor aliased the invoice table as "inner", a reserved word in
// Postgres, so every vendor page failed with a syntax error (#295). Run
// against real Postgres, since that is the only thing that parses it.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

const db = configured ? await import("../lib/db.ts") : null;
const queries = configured ? await import("../lib/queries.ts") : null;

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`
    CREATE TABLE vendor (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL, tax_id text, tax_id_kind text, address text
    )`);
  await db.query(`
    CREATE TABLE invoice (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id uuid NOT NULL REFERENCES vendor (id),
      status text NOT NULL DEFAULT 'confirmed',
      currency text NOT NULL DEFAULT 'INR',
      total numeric NOT NULL
    )`);
});

after(async () => {
  if (!db) return;
  await db.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
  await db.pool.end();
});

test("a vendor page's query runs and adds up spend per currency", { skip }, async () => {
  const [{ id }] = await db!.query<{ id: string }>("INSERT INTO vendor (name) VALUES ('Acme Traders') RETURNING id");
  await db!.query(
    `INSERT INTO invoice (vendor_id, total, currency, status) VALUES
     ($1, 100, 'INR', 'confirmed'), ($1, 50, 'INR', 'confirmed'), ($1, 20, 'USD', 'confirmed'), ($1, 999, 'INR', 'needs_review')`,
    [id],
  );
  const vendor = await queries!.getVendor(id);
  assert.ok(vendor, "no vendor came back");
  assert.equal(vendor.invoice_count, 4);
  assert.equal(vendor.needs_review, 1);
  assert.deepEqual(vendor.spends, [
    { currency: "INR", spend: 150 },
    { currency: "USD", spend: 20 },
  ]);
});

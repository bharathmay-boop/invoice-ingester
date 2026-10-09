// The invoices list and the saved invoice, against real Postgres. The filters
// are WHERE clauses and the order is an ORDER BY, so a unit test of the
// function that builds them would test nothing.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

const db = configured ? await import("../lib/db.ts") : null;
const q = configured ? await import("../lib/invoices/queries.ts") : null;

const NONE = { vendorId: null, from: null, to: null };

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`CREATE TABLE vendor (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL)`);
  await db.query(`CREATE TABLE item (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), canonical_name text NOT NULL)`);
  await db.query(`CREATE TABLE invoice (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id uuid NOT NULL REFERENCES vendor (id),
    invoice_number text NOT NULL,
    invoice_date date NOT NULL,
    currency text NOT NULL DEFAULT 'INR',
    subtotal numeric(14,2) NOT NULL DEFAULT 0,
    taxes jsonb NOT NULL DEFAULT '[]',
    adjustments jsonb NOT NULL DEFAULT '[]',
    total numeric(14,2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'confirmed',
    blob_url text, content_type text, first_page integer,
    created_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE line_item (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES invoice (id) ON DELETE CASCADE,
    raw_description text NOT NULL,
    quantity numeric(12,3) NOT NULL DEFAULT 1,
    unit text,
    unit_price numeric(14,4) NOT NULL DEFAULT 0,
    amount numeric(14,2) NOT NULL DEFAULT 0,
    item_id uuid REFERENCES item (id),
    variance_tag text)`);
});

beforeEach(async () => {
  if (!db) return;
  await db.query("DELETE FROM line_item");
  await db.query("DELETE FROM invoice");
  await db.query("DELETE FROM item");
  await db.query("DELETE FROM vendor");
});

after(async () => {
  if (db) {
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db.pool.end();
  }
});

async function vendor(name: string) {
  const [row] = await db!.query<{ id: string }>("INSERT INTO vendor (name) VALUES ($1) RETURNING id", [name]);
  return row.id;
}

async function invoice(vendorId: string, number: string, date: string, total = 100) {
  const [row] = await db!.query<{ id: string }>(
    `INSERT INTO invoice (vendor_id, invoice_number, invoice_date, total)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [vendorId, number, date, total],
  );
  return row.id;
}

test("invoices come newest first, each with its supplier", { skip }, async () => {
  const a = await vendor("Acme Traders");
  await invoice(a, "INV-1", "2026-04-10");
  await invoice(a, "INV-3", "2026-06-10");
  await invoice(a, "INV-2", "2026-05-10");
  const rows = await q!.listInvoices(NONE, 100);
  assert.deepEqual(rows.map((r) => r.invoice_number), ["INV-3", "INV-2", "INV-1"]);
  assert.equal(rows[0].vendor_name, "Acme Traders");
});

test("filtering by supplier shows only that supplier", { skip }, async () => {
  const a = await vendor("Acme");
  const b = await vendor("Northwind");
  await invoice(a, "A-1", "2026-04-10");
  await invoice(b, "B-1", "2026-04-11");
  const rows = await q!.listInvoices({ ...NONE, vendorId: b }, 100);
  assert.deepEqual(rows.map((r) => r.invoice_number), ["B-1"]);
});

test("a date range includes both of its ends", { skip }, async () => {
  const a = await vendor("Acme");
  await invoice(a, "before", "2026-03-31");
  await invoice(a, "first", "2026-04-01");
  await invoice(a, "middle", "2026-05-15");
  await invoice(a, "last", "2026-06-30");
  await invoice(a, "after", "2026-07-01");
  const rows = await q!.listInvoices({ ...NONE, from: "2026-04-01", to: "2026-06-30" }, 100);
  assert.deepEqual(rows.map((r) => r.invoice_number), ["last", "middle", "first"]);
});

test("supplier and dates narrow together", { skip }, async () => {
  const a = await vendor("Acme");
  const b = await vendor("Northwind");
  await invoice(a, "A-old", "2026-01-10");
  await invoice(a, "A-new", "2026-05-10");
  await invoice(b, "B-new", "2026-05-11");
  const rows = await q!.listInvoices({ vendorId: a, from: "2026-04-01", to: null }, 100);
  assert.deepEqual(rows.map((r) => r.invoice_number), ["A-new"]);
});

test("one row more than a page comes back, so the screen can say there is more", { skip }, async () => {
  const a = await vendor("Acme");
  for (let n = 1; n <= 5; n++) await invoice(a, `INV-${n}`, `2026-04-0${n}`);
  assert.equal((await q!.listInvoices(NONE, 3)).length, 4);
  assert.equal((await q!.listInvoices(NONE, 10)).length, 5);
});

test("findings are counted, and matching the contract is not one", { skip }, async () => {
  const a = await vendor("Acme");
  const inv = await invoice(a, "INV-1", "2026-04-10");
  for (const tag of ["billed_above_contract", "not_in_contract", "matches_contract", null]) {
    await db!.query("INSERT INTO line_item (invoice_id, raw_description, variance_tag) VALUES ($1,'x',$2)", [inv, tag]);
  }
  const [row] = await q!.listInvoices(NONE, 10);
  assert.equal(row.findings, 2);
});

test("a saved invoice comes back with its lines, its taxes and the item each line is", { skip }, async () => {
  const a = await vendor("Acme");
  const inv = await invoice(a, "INV-1", "2026-04-10", 118);
  await db!.query(
    `UPDATE invoice SET subtotal = 100,
       taxes = '[{"label":"GST","rate":18,"amount":18}]',
       adjustments = '[{"label":"Round off","amount":0}]' WHERE id = $1`,
    [inv],
  );
  const [paper] = await db!.query<{ id: string }>("INSERT INTO item (canonical_name) VALUES ('A4 Paper') RETURNING id");
  await db!.query(
    `INSERT INTO line_item (invoice_id, raw_description, quantity, unit, unit_price, amount, item_id)
     VALUES ($1,'a4 paper 80gsm',10,'ream',10,100,$2), ($1,'Zip ties',1,NULL,0,0,NULL)`,
    [inv, paper.id],
  );
  const got = await q!.getInvoice(inv);
  assert.ok(got);
  assert.equal(got.vendor_name, "Acme");
  assert.equal(got.subtotal, 100);
  assert.deepEqual(got.taxes, [{ label: "GST", rate: 18, amount: 18 }]);
  assert.equal(got.total, 118);
  assert.deepEqual(got.lines.map((l) => [l.raw_description, l.item_name]), [
    ["a4 paper 80gsm", "A4 Paper"],
    ["Zip ties", null],
  ]);
});

test("an invoice that does not exist is null, not an error", { skip }, async () => {
  assert.equal(await q!.getInvoice("00000000-0000-4000-8000-000000000000"), null);
});

// The database half of the contract check, against real Postgres.
//
// `assess` is tested as arithmetic in variance.test.ts, and it is only as good
// as the coverage handed to it. `coverageFor` is what decides which of the four
// answers that is, out of three SQL statements whose WHERE clauses are the
// whole behaviour: `reviewed`, the date window, and the two fallbacks. None of
// that can be exercised without a database, which is why it shipped untested.
//
// `recomputeVariance` is here for the same reason: it is the only writer of a
// variance tag, so a tag that should have been cleared and was not is a wrong
// figure on the findings screen with nothing to catch it.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
process.env.SETTINGS_MASTER_KEY ??= Buffer.alloc(32, 9).toString("base64");

const db = configured ? await import("../lib/db.ts") : null;
const lookup = configured ? await import("../lib/contracts/lookup.ts") : null;
const recompute = configured ? await import("../lib/contracts/recompute.ts") : null;

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`
    CREATE TABLE vendor (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      normalized_name text NOT NULL
    )`);
  await db.query(`
    CREATE TABLE item (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      canonical_name text NOT NULL,
      normalized_name text NOT NULL
    )`);
  await db.query(`
    CREATE TABLE invoice (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id uuid NOT NULL REFERENCES vendor (id),
      invoice_number text NOT NULL,
      invoice_date date NOT NULL,
      currency text NOT NULL DEFAULT 'INR',
      status text NOT NULL DEFAULT 'confirmed'
    )`);
  await db.query(`
    CREATE TABLE line_item (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id uuid NOT NULL REFERENCES invoice (id) ON DELETE CASCADE,
      raw_description text NOT NULL,
      quantity numeric(12,3) NOT NULL,
      unit text,
      unit_price numeric(14,4) NOT NULL,
      amount numeric(14,2) NOT NULL,
      item_id uuid REFERENCES item (id),
      variance_tag text,
      variance_contracted numeric(14,4),
      variance_impact numeric(14,2),
      variance_reason text
    )`);
  await db.query(`
    CREATE TABLE contract (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id uuid REFERENCES vendor (id),
      title text NOT NULL,
      blob_url text NOT NULL,
      content_type text NOT NULL,
      status text NOT NULL DEFAULT 'reviewed',
      digest text NOT NULL UNIQUE,
      other_terms jsonb NOT NULL DEFAULT '[]',
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.query(`
    CREATE TABLE contract_rate (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      contract_id uuid NOT NULL REFERENCES contract (id) ON DELETE CASCADE,
      vendor_id uuid REFERENCES vendor (id),
      item_id uuid REFERENCES item (id),
      printed_name text NOT NULL,
      unit text,
      rate numeric(14,4) NOT NULL,
      currency text NOT NULL DEFAULT 'INR',
      effective_from date NOT NULL,
      effective_to date,
      source_page integer,
      source_quote text,
      reviewed boolean NOT NULL DEFAULT false
    )`);
  await db.query(`CREATE TABLE setting (
    key text PRIMARY KEY, value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now())`);
});

beforeEach(async () => {
  if (!db) return;
  await db.query("DELETE FROM contract_rate");
  await db.query("DELETE FROM contract");
  await db.query("DELETE FROM line_item");
  await db.query("DELETE FROM invoice");
  await db.query("DELETE FROM item");
  await db.query("DELETE FROM vendor");
  await db.query("DELETE FROM setting");
});

after(async () => {
  if (!db) return;
  await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await db.pool.end();
});

async function vendor(name: string) {
  const [row] = await db!.query<{ id: string }>(
    "INSERT INTO vendor (name, normalized_name) VALUES ($1,$1) RETURNING id",
    [name],
  );
  return row.id;
}

async function item(name: string) {
  const [row] = await db!.query<{ id: string }>(
    "INSERT INTO item (canonical_name, normalized_name) VALUES ($1,$1) RETURNING id",
    [name],
  );
  return row.id;
}

async function contract(vendorId: string, title = "Rate Contract") {
  const [row] = await db!.query<{ id: string }>(
    `INSERT INTO contract (vendor_id, title, blob_url, content_type, digest)
     VALUES ($1,$2,'blob://x','application/pdf',$3) RETURNING id`,
    [vendorId, title, Math.random().toString(36).slice(2)],
  );
  return row.id;
}

async function rate(
  contractId: string,
  vendorId: string,
  itemId: string | null,
  value: number,
  from: string,
  to: string | null,
  { reviewed = true, unit = "ream" as string | null } = {},
) {
  const [row] = await db!.query<{ id: string }>(
    `INSERT INTO contract_rate
       (contract_id, vendor_id, item_id, printed_name, unit, rate,
        effective_from, effective_to, reviewed)
     VALUES ($1,$2,$3,'A4 Paper 80 GSM',$4,$5,$6,$7,$8) RETURNING id`,
    [contractId, vendorId, itemId, unit, value, from, to, reviewed],
  );
  return row.id;
}

async function invoice(vendorId: string, number: string, date: string) {
  const [row] = await db!.query<{ id: string }>(
    `INSERT INTO invoice (vendor_id, invoice_number, invoice_date)
     VALUES ($1,$2,$3) RETURNING id`,
    [vendorId, number, date],
  );
  return row.id;
}

async function line(
  invoiceId: string,
  itemId: string | null,
  unitPrice: number,
  quantity = 1,
  unit: string | null = "ream",
) {
  const [row] = await db!.query<{ id: string }>(
    `INSERT INTO line_item
       (invoice_id, raw_description, quantity, unit, unit_price, amount, item_id)
     VALUES ($1,'A4 paper',$2,$3,$4,$5,$6) RETURNING id`,
    [invoiceId, quantity, unit, unitPrice, unitPrice * quantity, itemId],
  );
  return row.id;
}

async function tagOf(lineId: string) {
  const [row] = await db!.query<{
    variance_tag: string | null;
    variance_impact: string | null;
  }>(
    "SELECT variance_tag, variance_impact FROM line_item WHERE id = $1",
    [lineId],
  );
  return row;
}

test("no contract with this supplier says nothing at all", { skip }, async () => {
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  assert.deepEqual(await lookup!.coverageFor(v, i, "2026-05-01"), { kind: "no_contract" });
});

test("a date inside the contract returns the rate in force", { skip }, async () => {
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const c = await contract(v);
  await rate(c, v, i, 285, "2026-04-01", "2027-03-31");

  const coverage = await lookup!.coverageFor(v, i, "2026-05-01");
  assert.equal(coverage.kind, "covered");
  assert.equal(coverage.kind === "covered" && coverage.rate.rate, 285);
});

test("a date past the contract is a finding, not silence", { skip }, async () => {
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const c = await contract(v);
  await rate(c, v, i, 285, "2025-04-01", "2026-03-31");

  assert.deepEqual(await lookup!.coverageFor(v, i, "2026-05-01"), { kind: "outside_period" });
});

test("a date before the contract started is the same finding", { skip }, async () => {
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const c = await contract(v);
  await rate(c, v, i, 285, "2026-04-01", "2027-03-31");

  assert.deepEqual(await lookup!.coverageFor(v, i, "2026-01-15"), { kind: "outside_period" });
});

test("an item a covering contract never prices is a third answer", { skip }, async () => {
  const v = await vendor("Gupta Traders");
  const priced = await item("a4 paper");
  const unpriced = await item("microgreens");
  const c = await contract(v);
  await rate(c, v, priced, 285, "2026-04-01", "2027-03-31");

  assert.deepEqual(await lookup!.coverageFor(v, unpriced, "2026-05-01"), { kind: "not_priced" });
});

test("a line that never matched an item is silence", { skip }, async () => {
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const c = await contract(v);
  await rate(c, v, i, 285, "2026-04-01", "2027-03-31");

  assert.deepEqual(await lookup!.coverageFor(v, null, "2026-05-01"), { kind: "no_contract" });
});

test("an unreviewed rate is invisible, which is what makes cheap reading safe", { skip }, async () => {
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const c = await contract(v);
  await rate(c, v, i, 285, "2026-04-01", "2027-03-31", { reviewed: false });

  // Not `not_priced` and not `outside_period` either: an unreviewed rate is
  // not a contract that exists as far as every one of the three queries goes.
  assert.deepEqual(await lookup!.coverageFor(v, i, "2026-05-01"), { kind: "no_contract" });
});

test("an open ended rate stays in force", { skip }, async () => {
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const c = await contract(v);
  await rate(c, v, i, 285, "2026-04-01", null);

  const coverage = await lookup!.coverageFor(v, i, "2029-12-31");
  assert.equal(coverage.kind, "covered");
});

test("the later of two overlapping rates wins", { skip }, async () => {
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const c = await contract(v);
  await rate(c, v, i, 285, "2026-04-01", null);
  // A revision letter, which is how an escalation arrives: new rows, same item.
  await rate(c, v, i, 299, "2026-07-01", null);

  const coverage = await lookup!.coverageFor(v, i, "2026-09-01");
  assert.equal(coverage.kind === "covered" && coverage.rate.rate, 299);
});

test("reviewing a contract tags invoices saved long before it", { skip }, async () => {
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const inv = await invoice(v, "INV-1", "2026-05-01");
  const l = await line(inv, i, 312, 10);

  const c = await contract(v);
  await rate(c, v, i, 285, "2026-04-01", "2027-03-31");

  assert.equal(await recompute!.recomputeVariance(v), 1);
  const row = await tagOf(l);
  assert.equal(row.variance_tag, "billed_above_contract");
  assert.equal(Number(row.variance_impact), 270);
});

test("a line that agrees is tagged as agreeing, not left blank", { skip }, async () => {
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const inv = await invoice(v, "INV-1", "2026-05-01");
  const l = await line(inv, i, 285, 10);
  const c = await contract(v);
  await rate(c, v, i, 285, "2026-04-01", "2027-03-31");

  await recompute!.recomputeVariance(v);
  assert.equal((await tagOf(l)).variance_tag, "matches_contract");
});

test("a recompute clears a tag that no longer applies", { skip }, async () => {
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const inv = await invoice(v, "INV-1", "2026-05-01");
  const l = await line(inv, i, 312, 10);
  const c = await contract(v);
  await rate(c, v, i, 285, "2026-04-01", "2027-03-31");
  await recompute!.recomputeVariance(v);
  assert.equal((await tagOf(l)).variance_tag, "billed_above_contract");

  // The contract was attached to the wrong supplier and the reviewer undid it.
  await db!.query("DELETE FROM contract_rate");
  await recompute!.recomputeVariance(v);
  const row = await tagOf(l);
  assert.equal(row.variance_tag, null);
  assert.equal(row.variance_impact, null);
});

test("one supplier's recompute leaves another's tags alone", { skip }, async () => {
  const i = await item("a4 paper");
  const a = await vendor("Gupta Traders");
  const b = await vendor("AMJ Distributors");
  const lineA = await line(await invoice(a, "A-1", "2026-05-01"), i, 312, 10);
  const lineB = await line(await invoice(b, "B-1", "2026-05-01"), i, 312, 10);
  const ca = await contract(a);
  const cb = await contract(b, "AMJ Rate Contract");
  await rate(ca, a, i, 285, "2026-04-01", null);
  await rate(cb, b, i, 285, "2026-04-01", null);

  await recompute!.recomputeVariance(a);
  assert.equal((await tagOf(lineA)).variance_tag, "billed_above_contract");
  assert.equal((await tagOf(lineB)).variance_tag, null);

  await recompute!.recomputeVariance(b);
  assert.equal((await tagOf(lineB)).variance_tag, "billed_above_contract");
});

test("the tolerance setting decides what counts as agreeing", { skip }, async () => {
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const inv = await invoice(v, "INV-1", "2026-05-01");
  const l = await line(inv, i, 286, 10);
  const c = await contract(v);
  await rate(c, v, i, 285, "2026-04-01", null);

  // A rupee on 285 is 0.35 percent, inside the half percent default.
  await recompute!.recomputeVariance(v);
  assert.equal((await tagOf(l)).variance_tag, "matches_contract");

  const { setSetting } = await import("../lib/settings/store.ts");
  await setSetting("variance_tolerance_percent", 0);
  await recompute!.recomputeVariance(v);
  assert.equal((await tagOf(l)).variance_tag, "billed_above_contract");
});

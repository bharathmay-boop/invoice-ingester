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
      variance_tag text CHECK (variance_tag IS NULL OR variance_tag IN (
        'matches_contract', 'billed_above_contract', 'billed_below_contract',
        'outside_contract_period', 'not_in_contract', 'units_differ',
        'currency_differs')),
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
      effective_from date,
      effective_to date,
      reviewed_at timestamptz,
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
      effective_from date,
      effective_to date,
      source_page integer,
      source_quote text,
      reviewed boolean NOT NULL DEFAULT false,
      new_item_name text,
      CONSTRAINT contract_rate_reviewed_has_start CHECK (NOT reviewed OR effective_from IS NOT NULL)
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
  { reviewed = true, unit = "ream" as string | null, currency = "INR" } = {},
) {
  const [row] = await db!.query<{ id: string }>(
    `INSERT INTO contract_rate
       (contract_id, vendor_id, item_id, printed_name, unit, rate,
        effective_from, effective_to, reviewed, currency)
     VALUES ($1,$2,$3,'A4 Paper 80 GSM',$4,$5,$6,$7,$8,$9) RETURNING id`,
    [contractId, vendorId, itemId, unit, value, from, to, reviewed, currency],
  );
  return row.id;
}

async function invoice(vendorId: string, number: string, date: string, currency = "INR") {
  const [row] = await db!.query<{ id: string }>(
    `INSERT INTO invoice (vendor_id, invoice_number, invoice_date, currency)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [vendorId, number, date, currency],
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
    variance_contracted: string | null;
  }>(
    `SELECT variance_tag, variance_impact, variance_contracted
     FROM line_item WHERE id = $1`,
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

test("the rate carries the currency it was agreed in", { skip }, async () => {
  // Without this the comparison has nothing to refuse with, which is how a
  // dollar rate came to be subtracted from a rupee price.
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const c = await contract(v);
  await rate(c, v, i, 285, "2026-04-01", "2027-03-31", { currency: "USD" });

  const coverage = await lookup!.coverageFor(v, i, "2026-05-01");
  assert.equal(coverage.kind === "covered" && coverage.rate.currency, "USD");
});

test("a rate in another currency is refused, not compared", { skip }, async () => {
  // The same number in two currencies is not a match, and the gap between two
  // numbers in two currencies is not money. Either answer would be confidently
  // wrong, which is worse than saying nothing.
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const c = await contract(v);
  await rate(c, v, i, 285, "2026-04-01", "2027-03-31", { currency: "USD" });

  const inv = await invoice(v, "INV-1", "2026-05-01", "INR");
  const l = await line(inv, i, 285, 10);
  await recompute!.recomputeVariance(v);

  const row = await tagOf(l);
  assert.equal(row.variance_tag, "currency_differs");
  assert.equal(row.variance_impact, null, "there is no figure to put against this");
  assert.equal(row.variance_contracted, "285.0000", "the agreed number is still worth showing");
});

test("the same currency on both sides still compares", { skip }, async () => {
  // The guard refuses a mismatch and nothing else: a pair that does match must
  // come out the same as it did before currency was looked at.
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const c = await contract(v);
  await rate(c, v, i, 270, "2026-04-01", "2027-03-31", { currency: "INR" });

  const inv = await invoice(v, "INV-1", "2026-05-01", "INR");
  const l = await line(inv, i, 297, 10);
  await recompute!.recomputeVariance(v);

  const row = await tagOf(l);
  assert.equal(row.variance_tag, "billed_above_contract");
  assert.equal(row.variance_impact, "270.00");
});

// #118. The period a reviewer confirms is stored on the contract, so coverage no
// longer depends on there being rate rows to infer it from.
async function periodContract(vendorId: string, from: string | null, to: string | null) {
  const id = await contract(vendorId);
  await db!.query("UPDATE contract SET effective_from = $2, effective_to = $3 WHERE id = $1", [id, from, to]);
  return id;
}

test("a reviewed contract with no rates still covers its dates", { skip }, async () => {
  const v = await vendor("Acme");
  const i = await item("A4 Paper");
  await periodContract(v, "2026-04-01", "2027-03-31");
  assert.deepEqual(await lookup!.coverageFor(v, i, "2026-09-01"), { kind: "not_priced" });
});

test("a reviewed contract with no rates is outside its period after it ends", { skip }, async () => {
  const v = await vendor("Acme");
  const i = await item("A4 Paper");
  await periodContract(v, "2026-04-01", "2027-03-31");
  assert.deepEqual(await lookup!.coverageFor(v, i, "2027-06-01"), { kind: "outside_period" });
});

test("a rateless contract reviewed before the period was stored stays silent", { skip }, async () => {
  const v = await vendor("Acme");
  const i = await item("A4 Paper");
  await periodContract(v, null, null);
  assert.deepEqual(await lookup!.coverageFor(v, i, "2026-09-01"), { kind: "no_contract" });
});

test("confirming stores the period and undated rates take it", { skip }, async () => {
  const confirm = await import("../lib/contracts/confirm.ts");
  const v = await vendor("Acme");
  const i = await item("A4 Paper");
  const c = await contract(v);
  await db!.query("UPDATE contract SET status = 'ready_for_review' WHERE id = $1", [c]);
  const own = await rate(c, v, i, 300, "2026-01-01", "2026-12-31", { reviewed: false });
  await db!.query(
    `INSERT INTO contract_rate (contract_id, item_id, printed_name, rate, currency, reviewed)
     VALUES ($1,$2,'Undated',250,'INR',false)`,
    [c, i],
  );

  const client = await db!.pool.connect();
  try {
    await confirm.applyReview(client, { contractId: c, vendorId: v, from: "2026-04-01", to: "2027-03-31" });
  } finally {
    client.release();
  }

  const [stored] = await db!.query<{ f: string; t: string; status: string }>(
    "SELECT to_char(effective_from,'YYYY-MM-DD') f, to_char(effective_to,'YYYY-MM-DD') t, status FROM contract WHERE id = $1",
    [c],
  );
  assert.deepEqual(stored, { f: "2026-04-01", t: "2027-03-31", status: "reviewed" });

  const rows = await db!.query<{ printed_name: string; f: string; t: string }>(
    "SELECT printed_name, to_char(effective_from,'YYYY-MM-DD') f, to_char(effective_to,'YYYY-MM-DD') t FROM contract_rate WHERE contract_id = $1 ORDER BY printed_name",
    [c],
  );
  assert.deepEqual(rows, [
    { printed_name: "A4 Paper 80 GSM", f: "2026-01-01", t: "2026-12-31" },
    { printed_name: "Undated", f: "2026-04-01", t: "2027-03-31" },
  ]);
  assert.ok(own);
});

test("an undated rate cannot be reviewed without a start", { skip }, async () => {
  const v = await vendor("Acme");
  const i = await item("A4 Paper");
  const c = await contract(v);
  await assert.rejects(
    db!.query(
      `INSERT INTO contract_rate (contract_id, item_id, printed_name, rate, currency, reviewed)
       VALUES ($1,$2,'Undated',250,'INR',true)`,
      [c, i],
    ),
    /contract_rate_reviewed_has_start/,
  );
});

// Greptile on #220: a contract reviewed before the period was stored is covered
// by its rates, gaps included. Deriving one span from the earliest start and the
// latest end would have called April covered when nobody said so.
test("a legacy contract with a gap between its rates still leaves the gap uncovered", { skip }, async () => {
  const v = await vendor("Acme");
  const paper = await item("A4 Paper");
  const pens = await item("Pens");
  const c = await contract(v);
  await rate(c, v, paper, 285, "2026-01-01", "2026-03-31");
  await rate(c, v, paper, 290, "2026-07-01", "2026-12-31");
  assert.deepEqual(await lookup!.coverageFor(v, pens, "2026-04-15"), { kind: "outside_period" });
  assert.deepEqual(await lookup!.coverageFor(v, pens, "2026-08-15"), { kind: "not_priced" });
});

// #112: a tag is a stored copy of a comparison against a rate. Amending the rate
// of a live contract without redoing the comparison left every tag computed from
// the old figure in place, with nothing saying so.
test("correcting a live rate re-checks the invoices it was compared against", { skip }, async () => {
  const amend = await import("../lib/contracts/amend.ts");
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const inv = await invoice(v, "INV-1", "2026-05-01");
  const l = await line(inv, i, 312, 10);
  const c = await contract(v);
  const r = await rate(c, v, i, 285, "2026-04-01", "2027-03-31");

  await recompute!.recomputeVariance(v);
  assert.equal((await tagOf(l)).variance_tag, "billed_above_contract");

  const done = await amend.amendRateRow({ rateId: r, contractId: c, itemId: i, rate: 312, unit: "ream" });
  assert.deepEqual(done, { found: true, rechecked: true });
  const after = await tagOf(l);
  assert.equal(after.variance_tag, "matches_contract");
  assert.equal(after.variance_impact === null || Number(after.variance_impact) === 0, true);
});

test("moving a live rate to another item re-checks both items", { skip }, async () => {
  const amend = await import("../lib/contracts/amend.ts");
  const v = await vendor("Gupta Traders");
  const paper = await item("a4 paper");
  const pens = await item("blue pen");
  const inv = await invoice(v, "INV-1", "2026-05-01");
  const paperLine = await line(inv, paper, 312, 10);
  const penLine = await line(inv, pens, 312, 10);
  const c = await contract(v);
  const r = await rate(c, v, paper, 285, "2026-04-01", "2027-03-31");

  await recompute!.recomputeVariance(v);
  assert.equal((await tagOf(paperLine)).variance_tag, "billed_above_contract");
  assert.equal((await tagOf(penLine)).variance_tag, "not_in_contract");

  await amend.amendRateRow({ rateId: r, contractId: c, itemId: pens, rate: 285, unit: "ream" });
  assert.equal((await tagOf(paperLine)).variance_tag, "not_in_contract");
  assert.equal((await tagOf(penLine)).variance_tag, "billed_above_contract");
});

test("correcting a rate nobody has reviewed yet recomputes nothing", { skip }, async () => {
  const amend = await import("../lib/contracts/amend.ts");
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const c = await contract(v);
  const r = await rate(c, v, i, 285, "2026-04-01", "2027-03-31", { reviewed: false });
  const done = await amend.amendRateRow({ rateId: r, contractId: c, itemId: i, rate: 290, unit: "ream" });
  assert.deepEqual(done, { found: true, rechecked: false });
});

test("amending a rate that is not on that contract changes nothing", { skip }, async () => {
  const amend = await import("../lib/contracts/amend.ts");
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const c = await contract(v);
  const other = await contract(v, "Other");
  const r = await rate(c, v, i, 285, "2026-04-01", "2027-03-31");
  const done = await amend.amendRateRow({ rateId: r, contractId: other, itemId: i, rate: 999, unit: "ream" });
  assert.deepEqual(done, { found: false, rechecked: false });
  const [row] = await db!.query<{ rate: string }>("SELECT rate::text FROM contract_rate WHERE id = $1", [r]);
  assert.equal(Number(row.rate), 285);
});

// Greptile on #221. The pool holds three connections. A re-check that kept one
// and asked for a second for each lookup could deadlock the process once three
// ran at the same time.
test("more re-checks than the pool has connections still finish", { skip }, async () => {
  const vendors = [];
  for (let n = 0; n < 6; n++) {
    const v = await vendor(`Supplier ${n}`);
    const i = await item(`item ${n}`);
    const inv = await invoice(v, `INV-${n}`, "2026-05-01");
    await line(inv, i, 312, 10);
    const c = await contract(v);
    await rate(c, v, i, 285, "2026-04-01", "2027-03-31");
    vendors.push(v);
  }
  const finished = Promise.all(vendors.map((v) => recompute!.recomputeVariance(v)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("deadlocked")), 30_000);
  });
  try {
    assert.deepEqual(await Promise.race([finished, timeout]), [1, 1, 1, 1, 1, 1]);
  } finally {
    clearTimeout(timer);
  }
});

// Also from #221. Two corrections to the same supplier, overlapping. Whatever
// order they run in, the findings have to end up reflecting both.
test("overlapping corrections leave findings that reflect the last rate", { skip }, async () => {
  const amend = await import("../lib/contracts/amend.ts");
  const v = await vendor("Gupta Traders");
  const a = await item("a4 paper");
  const b = await item("blue pen");
  const inv = await invoice(v, "INV-1", "2026-05-01");
  const la = await line(inv, a, 312, 10);
  const lb = await line(inv, b, 50, 10);
  const c = await contract(v);
  const ra = await rate(c, v, a, 285, "2026-04-01", "2027-03-31");
  const rb = await rate(c, v, b, 40, "2026-04-01", "2027-03-31");
  await recompute!.recomputeVariance(v);

  await Promise.all([
    amend.amendRateRow({ rateId: ra, contractId: c, itemId: a, rate: 312, unit: "ream" }),
    amend.amendRateRow({ rateId: rb, contractId: c, itemId: b, rate: 50, unit: "ream" }),
  ]);
  assert.equal((await tagOf(la)).variance_tag, "matches_contract");
  assert.equal((await tagOf(lb)).variance_tag, "matches_contract");
});

// Also from #221. The correction and the re-check succeed or fail together.
test("a failed re-check does not leave the corrected rate behind", { skip }, async () => {
  const amend = await import("../lib/contracts/amend.ts");
  const v = await vendor("Gupta Traders");
  const i = await item("a4 paper");
  const inv = await invoice(v, "INV-1", "2026-05-01");
  await line(inv, i, 312, 10);
  const c = await contract(v);
  const r = await rate(c, v, i, 285, "2026-04-01", "2027-03-31");
  await db!.query(`
    CREATE FUNCTION refuse_update() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'the re-check failed'; END $$`);
  await db!.query(
    "CREATE TRIGGER refuse BEFORE UPDATE ON line_item FOR EACH ROW EXECUTE FUNCTION refuse_update()",
  );
  try {
    await assert.rejects(
      amend.amendRateRow({ rateId: r, contractId: c, itemId: i, rate: 999, unit: "ream" }),
      /the re-check failed/,
    );
  } finally {
    await db!.query("DROP TRIGGER refuse ON line_item");
    await db!.query("DROP FUNCTION refuse_update()");
  }
  const [row] = await db!.query<{ rate: string }>("SELECT rate::text FROM contract_rate WHERE id = $1", [r]);
  assert.equal(Number(row.rate), 285);
});

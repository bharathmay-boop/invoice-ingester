// The findings the demo advertises, against real Postgres.
//
// `demo-contracts.test.ts` checks properties of the contracts: one lapses,
// paper is priced twice, something is agreed by a pack size. None of that
// compares a contract with an invoice, so moving an invoice date or nudging a
// price could quietly remove an advertised finding and every assertion would
// still pass.
//
// This loads the demo set into a throwaway schema, runs the only function that
// writes a variance tag, and asserts the answers. A demo that promises six
// tags and produces four is a demo that argues against the product.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
process.env.SETTINGS_MASTER_KEY ??= Buffer.alloc(32, 9).toString("base64");

const db = configured ? await import("../lib/db.ts") : null;
const recompute = configured ? await import("../lib/contracts/recompute.ts") : null;
const { contracts } = await import("../lib/demo/contracts.ts");
const { invoices, items, vendors } = await import("../lib/demo/dataset.ts");

/** Tag counts by vendor name, so a change can be read as well as caught. */
const tags = new Map<string, Map<string, number>>();

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`
    CREATE TABLE vendor (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tax_id text,
      name text NOT NULL,
      normalized_name text NOT NULL
    )`);
  await db.query(`
    CREATE TABLE item (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      canonical_name text NOT NULL,
      normalized_name text NOT NULL UNIQUE
    )`);
  await db.query(`
    CREATE TABLE invoice (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id uuid NOT NULL REFERENCES vendor (id),
      invoice_number text NOT NULL,
      invoice_date date NOT NULL,
      currency text NOT NULL DEFAULT 'INR'
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
    CREATE TABLE contract_rate (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id uuid REFERENCES vendor (id),
      item_id uuid REFERENCES item (id),
      printed_name text NOT NULL,
      unit text,
      rate numeric(14,4) NOT NULL,
      currency text NOT NULL DEFAULT 'INR',
      effective_from date NOT NULL,
      effective_to date,
      reviewed boolean NOT NULL DEFAULT false
    )`);
  await db.query(`CREATE TABLE setting (
    key text PRIMARY KEY, value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now())`);

  // The demo set, loaded the way the seed loads it, minus the parts the
  // variance pass does not read: blobs, taxes, totals, statuses.
  const vendorIds = new Map<string, string>();
  for (const vendor of vendors) {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO vendor (tax_id, name, normalized_name)
       VALUES ($1,$2,$3) RETURNING id`,
      [vendor.gstin, vendor.name, vendor.name.toLowerCase()],
    );
    vendorIds.set(vendor.gstin, row.id);
  }

  const itemIds = new Map<string, string>();
  for (const item of items) {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO item (canonical_name, normalized_name)
       VALUES ($1,$2) RETURNING id`,
      [item.canonicalName, item.normalizedName],
    );
    itemIds.set(item.normalizedName, row.id);
  }

  for (const invoice of invoices) {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO invoice (vendor_id, invoice_number, invoice_date)
       VALUES ($1,$2,$3) RETURNING id`,
      [vendorIds.get(invoice.gstin), invoice.number, invoice.date],
    );
    for (const line of invoice.lines) {
      await db.query(
        `INSERT INTO line_item
           (invoice_id, raw_description, quantity, unit, unit_price, amount, item_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          row.id,
          line.description,
          line.quantity,
          line.unit,
          line.unitPrice,
          line.amount,
          itemIds.get(line.normalizedName),
        ],
      );
    }
  }

  for (const contract of contracts) {
    for (const rate of contract.rates) {
      await db.query(
        `INSERT INTO contract_rate
           (vendor_id, item_id, printed_name, unit, rate, effective_from,
            effective_to, reviewed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
        [
          vendorIds.get(contract.gstin),
          rate.item ? itemIds.get(rate.item) : null,
          rate.printedName,
          rate.unit,
          rate.rate,
          rate.effectiveFrom,
          rate.effectiveTo,
        ],
      );
    }
  }

  for (const gstin of new Set(contracts.map((contract) => contract.gstin))) {
    await recompute!.recomputeVariance(vendorIds.get(gstin)!);
  }

  const rows = await db.query<{ name: string; variance_tag: string | null; n: number }>(
    `SELECT v.name, li.variance_tag, count(*)::int AS n
     FROM line_item li
     JOIN invoice i ON i.id = li.invoice_id
     JOIN vendor v ON v.id = i.vendor_id
     GROUP BY v.name, li.variance_tag`,
  );
  for (const row of rows) {
    if (!tags.has(row.name)) tags.set(row.name, new Map());
    tags.get(row.name)!.set(row.variance_tag ?? "none", row.n);
  }
});

after(async () => {
  if (!db) return;
  await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await db.pool.end();
});

const total = (tag: string) =>
  [...tags.values()].reduce((sum, byTag) => sum + (byTag.get(tag) ?? 0), 0);

test("the demo produces every answer it is built to show", { skip }, () => {
  // Counts rather than mere presence: losing five of six of a tag is the same
  // kind of edit as losing all of them, and reads as a working demo.
  assert.deepEqual(
    {
      billed_above_contract: total("billed_above_contract"),
      not_in_contract: total("not_in_contract"),
      outside_contract_period: total("outside_contract_period"),
      matches_contract: total("matches_contract"),
      units_differ: total("units_differ"),
      billed_below_contract: total("billed_below_contract"),
    },
    {
      billed_above_contract: 6,
      not_in_contract: 6,
      outside_contract_period: 6,
      matches_contract: 4,
      units_differ: 2,
      billed_below_contract: 1,
    },
  );
});

test("the supplier with no contract is left alone entirely", { skip }, () => {
  // Silence for an uncontracted supplier is a decision, and the only way to
  // show it is for one supplier's lines to carry no tag at all.
  const sharma = tags.get("Sharma Paper and Board");
  assert.ok(sharma, "the uncontracted supplier is missing from the demo");
  assert.deepEqual([...sharma.keys()], ["none"]);
});

test("a contract that lapsed says so rather than going quiet", { skip }, () => {
  // Nandi's contract ends on 30 June and is never renewed, so its August and
  // September lines are the lapse case. If this turns into silence the most
  // valuable finding in the demo has gone.
  const nandi = tags.get("Nandi Stationers");
  assert.equal(nandi?.get("outside_contract_period"), 4);
  assert.equal(nandi?.get("none"), undefined, "every Nandi line should carry a tag");
});

test("the money on the findings screen is what the rates imply", { skip }, async () => {
  if (!db) return;
  const [row] = await db.query<{ above: string; below: string }>(
    `SELECT
       coalesce(sum(variance_impact) FILTER (WHERE variance_tag = 'billed_above_contract'), 0) AS above,
       coalesce(sum(variance_impact) FILTER (WHERE variance_tag = 'billed_below_contract'), 0) AS below
     FROM line_item`,
  );
  // 280 + 125 + 60 + 60 + 30 + 20 above, and one line 60 under.
  assert.equal(Number(row.above), 575);
  assert.equal(Number(row.below), -60);
});

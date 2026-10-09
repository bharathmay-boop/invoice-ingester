// Everything downstream of extraction, against a set built to exercise it.
//
// The real invoice run on #94 proved extraction and proved nothing else: no two
// of its fifteen invoices shared a vendor and an item, so price history,
// cheapest vendor and the suggestion queue were never reached. That is not a
// volume problem. A hundred more unrelated invoices prove the same nothing.
//
// So the invoices here are constructed, with the overlaps on purpose. What is
// under test is the matching, and a constructed invoice exercises that exactly
// as well as a found one.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
process.env.SETTINGS_MASTER_KEY ??= Buffer.alloc(32, 9).toString("base64");

const db = configured ? await import("../lib/db.ts") : null;
const saving = configured ? await import("../lib/items/save-line.ts") : null;
const suggestions = configured ? await import("../lib/items/suggestions.ts") : null;
const { cheapestVendorNow, comparePrices } = await import("../lib/price.ts");

const thresholds = { link: 0.85, suggest: 0.6 };

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`
    CREATE TABLE vendor (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      normalized_name text NOT NULL,
      normalized_address text NOT NULL DEFAULT ''
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
    CREATE TABLE item (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      canonical_name text NOT NULL,
      normalized_name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.query("CREATE INDEX ON item USING gin (normalized_name gin_trgm_ops)");
  await db.query(`
    CREATE TABLE item_alias (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id uuid NOT NULL REFERENCES item (id) ON DELETE CASCADE,
      alias text NOT NULL,
      normalized_name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (normalized_name)
    )`);
  await db.query("CREATE INDEX ON item_alias USING gin (normalized_name gin_trgm_ops)");
  await db.query(`
    CREATE TABLE line_item (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id uuid NOT NULL REFERENCES invoice (id) ON DELETE CASCADE,
      raw_description text NOT NULL,
      hsn_code text,
      quantity numeric(12,3) NOT NULL,
      unit text,
      unit_price numeric(14,4) NOT NULL,
      amount numeric(14,2) NOT NULL,
      item_id uuid REFERENCES item (id),
      match_confidence numeric(4,3)
    )`);
  await db.query(`
    CREATE TABLE match_suggestion (
      line_item_id uuid PRIMARY KEY REFERENCES line_item (id) ON DELETE CASCADE,
      item_id uuid NOT NULL REFERENCES item (id) ON DELETE CASCADE,
      score numeric(4,3) NOT NULL,
      decision text CHECK (decision IN ('accepted', 'rejected')),
      created_at timestamptz NOT NULL DEFAULT now(),
      decided_at timestamptz
    )`);
  await db.query(`CREATE TABLE setting (
    key text PRIMARY KEY, value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now())`);
});

beforeEach(async () => {
  if (!db) return;
  await db.query("DELETE FROM match_suggestion");
  await db.query("DELETE FROM line_item");
  await db.query("DELETE FROM item_alias");
  await db.query("DELETE FROM item");
  await db.query("DELETE FROM invoice");
  await db.query("DELETE FROM vendor");
});

after(async () => {
  if (!db) return;
  await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await db.pool.end();
});

async function vendor(name: string) {
  const { normalize } = await import("../lib/items/normalize.ts");
  const [row] = await db!.query<{ id: string }>(
    "INSERT INTO vendor (name, normalized_name) VALUES ($1,$2) RETURNING id",
    [name, normalize(name)],
  );
  return row.id;
}

async function invoice(vendorId: string, number: string, date: string, currency = "INR") {
  const [row] = await db!.query<{ id: string }>(
    "INSERT INTO invoice (vendor_id, invoice_number, invoice_date, currency) VALUES ($1,$2,$3,$4) RETURNING id",
    [vendorId, number, date, currency],
  );
  return row.id;
}

/** One line through the real save path, inside its own transaction. */
async function line(
  invoiceId: string,
  description: string,
  unitPrice: number,
  unit: string | null,
  quantity = 1,
) {
  const client = await db!.pool.connect();
  try {
    await client.query("BEGIN");
    const saved = await saving!.saveLine(
      client,
      invoiceId,
      {
        description,
        item_code: null,
        quantity,
        unit,
        unit_price: unitPrice,
        amount: unitPrice * quantity,
      },
      thresholds,
    );
    await client.query("COMMIT");
    return saved;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** What the item screen would be working from, for one catalogue entry. */
async function purchases(itemId: string) {
  return db!.query<{
    vendor_id: string;
    vendor_name: string;
    unit_price: number;
    invoice_date: string;
    unit: string | null;
    currency: "INR" | "USD" | "EUR";
  }>(
    `SELECT v.id AS vendor_id, v.name AS vendor_name, li.unit_price::float,
            i.invoice_date::text, li.unit, i.currency
     FROM line_item li
     JOIN invoice i ON i.id = li.invoice_id
     JOIN vendor v ON v.id = i.vendor_id
     WHERE li.item_id = $1
     ORDER BY i.invoice_date DESC`,
    [itemId],
  );
}

test("a repeat purchase from one supplier becomes a price history", { skip }, async () => {
  // Nothing on the item screen exists without this. It is the single most
  // basic thing downstream of extraction and it had never been run.
  const sharma = await vendor("Sharma Paper Products");
  const april = await invoice(sharma, "INV-1", "2026-04-02");
  const july = await invoice(sharma, "INV-2", "2026-07-19");

  const first = await line(april, "A4 Paper 80 GSM", 254, "ream");
  const second = await line(july, "A4 Paper 80GSM", 268, "ream");

  assert.equal(first.itemId !== null, true, "the first line created the catalogue entry");
  assert.equal(second.itemId, first.itemId, "the second found it despite the spacing");

  const history = await purchases(first.itemId!);
  assert.equal(history.length, 2, "a history needs more than one point to be a history");
  assert.deepEqual(
    history.map((h) => h.unit_price),
    [268, 254],
    "newest first",
  );
});

test("two suppliers selling the same thing produce a cheapest", { skip }, async () => {
  const sharma = await vendor("Sharma Paper Products");
  const nandi = await vendor("Nandi Stationers");

  const a = await line(await invoice(sharma, "S-1", "2026-04-02"), "A4 Paper 80 GSM", 285, "ream");
  await line(await invoice(nandi, "N-1", "2026-04-05"), "A4 Paper 80 GSM", 262, "ream");

  const rows = await purchases(a.itemId!);
  const best = cheapestVendorNow(rows);
  assert.equal(best?.vendor_name, "Nandi Stationers");
});

test("the same product bought by the kilo and by the gram is one comparison", { skip }, async () => {
  // The conversion path has only ever seen fixtures. This is it against rows
  // that went through the save path.
  const bulk = await vendor("Bulk Supplies");
  const retail = await vendor("Retail Supplies");

  const a = await line(await invoice(bulk, "B-1", "2026-04-02"), "Microgreens", 450, "kg");
  await line(await invoice(retail, "R-1", "2026-04-03"), "Microgreens", 0.52, "g");

  const rows = await purchases(a.itemId!);
  const comparison = comparePrices(rows);
  assert.equal(comparison.comparable, true, comparison.comparable ? "" : comparison.reason);

  const best = cheapestVendorNow(rows);
  assert.equal(best?.vendor_name, "Bulk Supplies", "0.45 a gram beats 0.52 a gram");
});

test("a pack size against a real unit refuses, and says why", { skip }, async () => {
  // The refusal is the feature. It had never refused anything real.
  const a = await vendor("Sharma Paper Products");
  const b = await vendor("Nandi Stationers");

  const first = await line(await invoice(a, "A-1", "2026-04-02"), "A4 Paper 80 GSM", 285, "ream");
  await line(await invoice(b, "B-1", "2026-04-03"), "A4 Paper 80 GSM", 0.57, "sheet");

  const rows = await purchases(first.itemId!);
  const comparison = comparePrices(rows);
  assert.equal(comparison.comparable, false);
  if (!comparison.comparable) assert.match(comparison.reason, /pack size/);
  assert.equal(cheapestVendorNow(rows), null, "no recommendation beats a wrong one");
});

test("the same item in two currencies is not compared", { skip }, async () => {
  const india = await vendor("Sharma Paper Products");
  const milan = await vendor("Carta Milano");

  const first = await line(await invoice(india, "I-1", "2026-04-02"), "A4 Paper 80 GSM", 285, "ream");
  await line(
    await invoice(milan, "M-1", "2026-04-03", "EUR"),
    "A4 Paper 80 GSM",
    3.2,
    "ream",
  );

  const rows = await purchases(first.itemId!);
  const comparison = comparePrices(rows);
  assert.equal(comparison.comparable, false);
  if (!comparison.comparable) assert.match(comparison.reason, /EUR and INR/);
  assert.equal(cheapestVendorNow(rows), null);
});

test("a spelling that scores between the thresholds waits for a person", { skip }, async () => {
  // The suggestion queue had never held a row that came from a real save.
  const sharma = await vendor("Sharma Paper Products");
  await line(await invoice(sharma, "S-1", "2026-04-02"), "Stapler HD-45", 320, "pc");
  const near = await line(
    await invoice(sharma, "S-2", "2026-05-02"),
    "Stapler HD45",
    330,
    "pc",
  );

  assert.equal(near.itemId, null, "a borderline score does not link");
  assert.equal(near.suggested, true, "and does not quietly create a second entry either");

  const [waiting] = await db!.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM match_suggestion WHERE decision IS NULL",
  );
  assert.equal(waiting.n, 1);
});

test("accepting a suggestion joins the history, rejecting it does not", { skip }, async () => {
  const sharma = await vendor("Sharma Paper Products");
  const first = await line(
    await invoice(sharma, "S-1", "2026-04-02"),
    "Stapler HD-45",
    320,
    "pc",
  );
  const near = await line(
    await invoice(sharma, "S-2", "2026-05-02"),
    "Stapler HD45",
    330,
    "pc",
  );

  await suggestions!.applyDecision(near.lineItemId, "accepted");
  const joined = await purchases(first.itemId!);
  assert.equal(joined.length, 2, "accepting is what makes the two one history");

  // And the other way: a rejection is recorded so the same line is not asked
  // about again tomorrow, and the two stay apart.
  const other = await line(
    await invoice(sharma, "S-3", "2026-06-02"),
    "Stapler HD45 black",
    340,
    "pc",
  );
  await suggestions!.applyDecision(other.lineItemId, "rejected");

  const [undecided] = await db!.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM match_suggestion WHERE decision IS NULL",
  );
  assert.equal(undecided.n, 0, "nothing is left asking");

  const stillTwo = await purchases(first.itemId!);
  assert.equal(stillTwo.length, 2, "a rejection does not join anything");
});

test("a taught name joins two things that share no letters", { skip }, async () => {
  // The one case no threshold reaches, end to end through the save path rather
  // than through the matcher alone.
  const alias = await import("../lib/items/alias.ts");
  const sharma = await vendor("Sharma Paper Products");

  const xerox = await line(
    await invoice(sharma, "S-1", "2026-04-02"),
    "Xerox A4 80gsm colour",
    4.5,
    "pc",
  );

  await alias.addAlias(xerox.itemId!, "colour photocopy");

  const after = await line(
    await invoice(sharma, "S-2", "2026-05-02"),
    "Colour photocopy A4",
    5.1,
    "pc",
  );
  assert.equal(after.itemId, xerox.itemId, "the alias is what joins them");

  const history = await purchases(xerox.itemId!);
  assert.equal(history.length, 2, "and the two are one price history, which is the point");
});

test("an item's own name beats somebody else's alias for it", { skip }, async () => {
  // Found while writing the test above, which had set up a competing entry
  // without meaning to. It is the right precedence: an alias says "this name
  // also means that product", and it should not outrank a product actually
  // called that. Pinned so it stays deliberate rather than incidental.
  const alias = await import("../lib/items/alias.ts");
  const sharma = await vendor("Sharma Paper Products");

  const xerox = await line(
    await invoice(sharma, "S-1", "2026-04-02"),
    "Xerox A4 80gsm colour",
    4.5,
    "pc",
  );
  const photocopy = await line(
    await invoice(sharma, "S-2", "2026-05-02"),
    "Colour photocopy A4",
    4.8,
    "pc",
  );
  assert.notEqual(photocopy.itemId, xerox.itemId, "nothing joins these on spelling alone");

  await alias.addAlias(xerox.itemId!, "colour photocopy");

  const next = await line(
    await invoice(sharma, "S-3", "2026-06-02"),
    "Colour photocopy A4",
    5.1,
    "pc",
  );
  assert.equal(next.itemId, photocopy.itemId, "the entry actually called that still wins");
});

test("two invoices saved together create a new item once, not twice (#223)", { skip }, async () => {
  const v = await vendor("Racing Supplies");
  const first = await invoice(v, "R-1", "2026-09-01");
  const second = await invoice(v, "R-2", "2026-09-01");
  const row = { item_code: null, quantity: 1, unit: "pcs", unit_price: 10, amount: 10 };
  const description = "Hydraulic Floor Jack 2 Tonne";

  // The first save has made its item and not committed. The second starts now,
  // and must wait for it rather than look at a catalogue that cannot see it.
  const a = await db!.pool.connect();
  const b = await db!.pool.connect();
  try {
    await a.query("BEGIN");
    await saving!.saveLine(a, first, { ...row, description }, thresholds);

    await b.query("BEGIN");
    let finished = false;
    const waiting = saving!
      .saveLine(b, second, { ...row, description }, thresholds)
      .then((saved) => {
        finished = true;
        return saved;
      });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(finished, false, "the second save did not wait for the first");

    await a.query("COMMIT");
    const saved = await waiting;
    await b.query("COMMIT");
    assert.ok(saved.itemId);
  } finally {
    // A failed assertion must not leave either transaction holding locks.
    await a.query("ROLLBACK").catch(() => {});
    await b.query("ROLLBACK").catch(() => {});
    a.release();
    b.release();
  }

  const items = await db!.query("SELECT id FROM item WHERE canonical_name = $1", [description]);
  assert.equal(items.length, 1);
  const linked = await db!.query("SELECT DISTINCT item_id FROM line_item");
  assert.equal(linked.length, 1);
});

test("names are locked in one sorted order whatever order they arrive in", { skip }, async () => {
  const taken: string[][] = [];
  for (const names of [["Beta Widget", "Alpha Widget"], ["Alpha Widget", "Beta Widget"]]) {
    const client = await db!.pool.connect();
    try {
      await client.query("BEGIN");
      const query = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
      const seen: string[] = [];
      (client as unknown as { query: unknown }).query = (sql: unknown, params?: unknown[]) => {
        if (typeof sql === "string" && sql.includes("pg_advisory_xact_lock")) seen.push(String(params?.[0]));
        return query(sql, params);
      };
      await saving!.lockItemNames(client, names);
      taken.push(seen);
    } finally {
      // The pool hands the same client out again, so the spy must not stay on it.
      delete (client as unknown as { query?: unknown }).query;
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  }
  assert.deepEqual(taken[0], taken[1]);
  assert.deepEqual(taken[0], [...taken[0]].sort());
  assert.equal(taken[0].length, 2);
});

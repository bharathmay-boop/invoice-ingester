// The demo matcher cases (#157), run through the real matcher.
//
// The main demo set is all matched, so the suggestion queue was empty and
// nothing showed the matcher deciding anything. These cases exist to fill that
// gap, and they only do while the matcher keeps answering the way they were
// written for. This loads the demo catalogue into a throwaway schema, saves the
// cases through saveLine exactly as the seed does, and holds each outcome. A
// change to the normaliser or the thresholds that quietly empties the queue
// again fails here instead of on a visitor screen.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run vercel env pull";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

const db = configured ? await import("../lib/db.ts") : null;
const saving = configured ? await import("../lib/items/save-line.ts") : null;
const { items } = await import("../lib/demo/dataset.ts");
const { ALIASES, CASES, matcherInvoice, normalizedAlias } = await import("../lib/demo/matcher-cases.ts");
const { DEFAULT_LINK, DEFAULT_SUGGEST } = await import("../lib/items/match.ts");

const THRESHOLDS = { link: DEFAULT_LINK, suggest: DEFAULT_SUGGEST };

type Outcome = {
  itemName: string | null;
  confidence: number | null;
  suggestedName: string | null;
  score: number | null;
  demo: boolean | null;
};
const outcomes = new Map<string, Outcome>();
let withoutAlias: { itemName: string | null; suggestedName: string | null } | null = null;

async function readBack(client: import("pg").PoolClient) {
  const rows = await client.query(
    `SELECT li.raw_description, it.canonical_name AS item_name, li.match_confidence,
            sg.canonical_name AS suggested_name, ms.score, it.is_demo AS item_demo
     FROM line_item li
     LEFT JOIN item it ON it.id = li.item_id
     LEFT JOIN match_suggestion ms ON ms.line_item_id = li.id
     LEFT JOIN item sg ON sg.id = ms.item_id`,
  );
  const out = new Map<string, Outcome>();
  for (const r of rows.rows) {
    out.set(r.raw_description, {
      itemName: r.item_name,
      confidence: r.match_confidence === null ? null : Number(r.match_confidence),
      suggestedName: r.suggested_name,
      score: r.score === null ? null : Number(r.score),
      demo: r.item_demo,
    });
  }
  return out;
}

async function run(withAliases: boolean, only?: string) {
  const client = await db!.pool.connect();
  try {
    await client.query("BEGIN");
    if (withAliases) {
      for (const { alias, item } of ALIASES) {
        await client.query(
          `INSERT INTO item_alias (item_id, alias, normalized_name)
           SELECT id, $2, $3 FROM item WHERE canonical_name = $1`,
          [item, alias, normalizedAlias(alias)],
        );
      }
    }
    const inserted = await client.query("INSERT INTO invoice DEFAULT VALUES RETURNING id");
    const invoiceId = inserted.rows[0].id as string;
    for (const line of matcherInvoice.lines.filter((l) => !only || l.description === only)) {
      await saving!.saveLine(
        client,
        invoiceId,
        {
          description: line.description,
          item_code: line.itemCode,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unitPrice,
          amount: line.amount,
        },
        THRESHOLDS,
        { demo: true },
      );
    }
    const read = await readBack(client);
    await client.query("ROLLBACK");
    return read;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`CREATE TABLE item (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name text NOT NULL, normalized_name text NOT NULL,
    is_demo boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE item_alias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id uuid NOT NULL REFERENCES item (id) ON DELETE CASCADE,
    alias text NOT NULL, normalized_name text NOT NULL UNIQUE)`);
  await db.query(`CREATE TABLE invoice (id uuid PRIMARY KEY DEFAULT gen_random_uuid())`);
  await db.query(`CREATE TABLE line_item (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES invoice (id) ON DELETE CASCADE,
    raw_description text NOT NULL, hsn_code text,
    quantity numeric NOT NULL, unit text, unit_price numeric NOT NULL,
    amount numeric NOT NULL,
    item_id uuid REFERENCES item (id), match_confidence numeric)`);
  await db.query(`CREATE TABLE match_suggestion (
    line_item_id uuid PRIMARY KEY REFERENCES line_item (id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES item (id) ON DELETE CASCADE,
    score numeric NOT NULL)`);

  for (const item of items) {
    await db.query(
      "INSERT INTO item (canonical_name, normalized_name, is_demo) VALUES ($1,$2,true)",
      [item.canonicalName, item.normalizedName],
    );
  }

  // The seed path: aliases in, every case through the matcher.
  for (const [key, value] of await run(true)) outcomes.set(key, value);

  // The same alias line with no alias taught, to show the alias is what did it.
  const bare = await run(false, "B/P PEN BLUE 10S");
  const only = bare.get("B/P PEN BLUE 10S")!;
  withoutAlias = { itemName: only.itemName, suggestedName: only.suggestedName };
});

after(async () => {
  if (db) {
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db.pool.end();
  }
});

const caseFor = (description: string) => CASES.find((c) => c.description === description)!;

test("a confident match links on its own, at a score worth showing", { skip }, () => {
  const got = outcomes.get("Black Whiteboard Markers")!;
  assert.equal(got.itemName, caseFor("Black Whiteboard Markers").item);
  assert.ok(got.confidence! >= THRESHOLDS.link && got.confidence! < 1, `scored ${got.confidence}`);
});

test("near misses wait in the queue with the score the matcher gave them", { skip }, () => {
  for (const description of ["Stapler HD45", "Pen Ballpoint Blue Smooth"]) {
    const got = outcomes.get(description)!;
    assert.equal(got.itemName, null, `${description} is not decided`);
    assert.equal(got.suggestedName, caseFor(description).item, description);
    assert.ok(
      got.score! >= THRESHOLDS.suggest && got.score! < THRESHOLDS.link,
      `${description} scored ${got.score}`,
    );
  }
});

test("something genuinely new becomes a new item, labelled as demo", { skip }, () => {
  const got = outcomes.get("Hydraulic Floor Jack 2 Tonne")!;
  assert.equal(got.itemName, "Hydraulic Floor Jack 2 Tonne");
  assert.equal(got.suggestedName, null);
  assert.equal(got.demo, true, "left unlabelled it would survive the next seed");
});

test("a taught alias links a name the catalogue would not have scored", { skip }, () => {
  const got = outcomes.get("B/P PEN BLUE 10S")!;
  assert.equal(got.itemName, caseFor("B/P PEN BLUE 10S").item);
  assert.equal(got.confidence, 1);
  assert.ok(withoutAlias);
  // With nothing taught it is not the pen: it falls through to a new item.
  assert.equal(withoutAlias.itemName, "B/P PEN BLUE 10S");
  assert.equal(withoutAlias.suggestedName, null);
});

test("the queue ends up with several entries, and every case has its answer", { skip }, () => {
  assert.ok(CASES.filter((c) => c.expect === "suggested").length >= 2);
  assert.equal(outcomes.size, CASES.length);
  for (const c of CASES) {
    const got = outcomes.get(c.description)!;
    const actual = got.suggestedName ? "suggested" : got.confidence !== null ? "linked" : "new";
    assert.equal(actual, c.expect, c.description);
  }
});

test("the demo invoice is confirmed and comes from a supplier with no contract", { skip }, () => {
  assert.equal(matcherInvoice.status, "confirmed");
  assert.equal(matcherInvoice.gstin, "07AAGCS9012H1Z8");
});

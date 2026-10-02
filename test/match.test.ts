// Item matching decides whether two lines are the same product, and every
// spend figure and price history downstream depends on that answer. The
// boundaries are tested against real Postgres trigram scores rather than a
// mock, because the scores are the behaviour.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
process.env.SETTINGS_MASTER_KEY ??= Buffer.alloc(32, 9).toString("base64");

const db = configured ? await import("../lib/db.ts") : null;
const saving = configured ? await import("../lib/items/save-line.ts") : null;
const { normalize } = await import("../lib/items/normalize.ts");
const match = configured ? await import("../lib/items/match.ts") : null;

const thresholds = { link: 0.85, suggest: 0.6 };

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`
    CREATE TABLE item (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      canonical_name text NOT NULL,
      normalized_name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.query("CREATE INDEX ON item USING gin (normalized_name gin_trgm_ops)");
  await db.query(`CREATE TABLE setting (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now())`);
  // Enough of the real shape to catch a wrong column, a broken foreign key or
  // a write that lands in the wrong table.
  await db.query(`
    CREATE TABLE line_item (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id uuid NOT NULL,
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
});

after(async () => {
  if (!db) return;
  await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await db.pool.end();
});

/** Adds a catalogue item the way the save path does, and returns its id. */
async function catalogue(name: string) {
  const [row] = await db!.query<{ id: string }>(
    "INSERT INTO item (canonical_name, normalized_name) VALUES ($1,$2) RETURNING id",
    [name, normalize(name)],
  );
  return row.id;
}

async function matchFor(description: string, over = thresholds) {
  const client = await db!.pool.connect();
  try {
    await client.query("BEGIN");
    return await match!.findMatch(client, normalize(description), over);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

test("a description that normalises the same way links outright", { skip }, async () => {
  const id = await catalogue("A4 Paper 500 Sheets");
  // Different word order, different case, same product: normalisation makes
  // these identical, so the score is 1 and nobody needs to be asked.
  const result = await matchFor("paper a4, 500 sheets");
  assert.deepEqual(result, { kind: "linked", itemId: id, score: 1 });
});

test("a spelling that survives normalisation is offered, not merged", { skip }, async () => {
  const id = await catalogue("Stapler HD-45");

  // The case this issue was raised for. It scores about 0.69, which is inside
  // the band rather than above it, so it is offered for a decision instead of
  // linked. That is the honest answer: measured against real descriptions, two
  // different products ("HP 802 Cartridge" and "HP 803 Cartridge", 0.79) score
  // higher than these two spellings of one product, so no single threshold
  // separates same from different. What this fixes is the old behaviour, which
  // silently made a second catalogue entry and split the price history.
  const result = await matchFor("Stapler HD45");
  assert.equal(result.kind, "suggested", JSON.stringify(result));
  assert.equal(result.kind === "suggested" && result.itemId, id);
});

test("a different product is not swallowed by a near neighbour", { skip }, async () => {
  await catalogue("A4 Paper 500 Sheets");
  // Same family, different product. Whatever else happens it must not link,
  // or one price history quietly covers two things.
  const result = await matchFor("A3 Paper 500 Sheets");
  assert.notEqual(result.kind, "linked");
});

test("the boundaries are inclusive at both ends", { skip }, async () => {
  const id = await catalogue("Ink Cartridge 803B");
  const near = await matchFor("Ink Cartridge 803");
  // Narrowed by the assertion, so the score below is the real one rather than
  // a fallback that would quietly make this test prove nothing.
  if (near.kind === "new") throw new Error("expected a score worth deciding on");
  const score = near.score;

  // At exactly the link threshold it links: a threshold is the score you are
  // willing to accept, not the first one you refuse.
  const atLink = await matchFor("Ink Cartridge 803", { link: score, suggest: 0.3 });
  assert.deepEqual(atLink, { kind: "linked", itemId: id, score });

  // A hair above and the same score only suggests.
  const justAbove = await matchFor("Ink Cartridge 803", { link: score + 0.001, suggest: 0.3 });
  assert.equal(justAbove.kind, "suggested");

  // At exactly the suggest threshold it still suggests.
  const atSuggest = await matchFor("Ink Cartridge 803", { link: 0.99, suggest: score });
  assert.equal(atSuggest.kind, "suggested");

  // And above it, nothing is offered at all.
  const justPast = await matchFor("Ink Cartridge 803", { link: 0.99, suggest: score + 0.001 });
  assert.deepEqual(justPast, { kind: "new" });
});

test("an empty catalogue has nothing to match against", { skip }, async () => {
  const client = await db!.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM item");
    assert.deepEqual(await match!.findMatch(client, normalize("Anything At All"), thresholds), {
      kind: "new",
    });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("thresholds that would contradict each other are refused", { skip }, () => {
  const bad = [
    { link: 0.5, suggest: 0.9 },
    { link: 0, suggest: 0 },
    { link: 1.5, suggest: 0.6 },
    { link: Number.NaN, suggest: 0.6 },
  ];
  for (const t of bad) {
    assert.throws(() => match!.checkThresholds(t), /threshold/, JSON.stringify(t));
  }
  assert.deepEqual(match!.checkThresholds({ link: 0.85, suggest: 0.6 }), { link: 0.85, suggest: 0.6 });
  // Equal is allowed: it means no band at all, link or create, nothing to ask.
  assert.deepEqual(match!.checkThresholds({ link: 0.7, suggest: 0.7 }), { link: 0.7, suggest: 0.7 });
});

// --- what actually gets written --------------------------------------------

const INVOICE = "11111111-1111-4111-8111-111111111111";

/**
 * These tests assert which item was linked, so they need a catalogue they own.
 * Earlier tests leave items with the same names behind, and the match would
 * land on whichever was written first.
 */
async function emptyCatalogue() {
  await db!.query("DELETE FROM match_suggestion");
  await db!.query("DELETE FROM line_item");
  await db!.query("DELETE FROM item");
}

const line = (description: string) => ({
  description,
  item_code: "8305",
  quantity: 2,
  unit: "pc",
  unit_price: 320,
  amount: 640,
});

/** Saves one line the way a confirmed invoice does, then rolls it back. */
async function saved(description: string, over = thresholds) {
  const client = await db!.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await saving!.saveLine(client, INVOICE, line(description), over);
    const [row] = (
      await client.query<{ item_id: string | null; match_confidence: string | null }>(
        "SELECT item_id, match_confidence FROM line_item WHERE id = $1",
        [result.lineItemId],
      )
    ).rows;
    const suggestions = (
      await client.query<{ item_id: string; score: string }>(
        "SELECT item_id, score FROM match_suggestion WHERE line_item_id = $1",
        [result.lineItemId],
      )
    ).rows;
    const items = (await client.query<{ n: string }>("SELECT count(*) AS n FROM item")).rows[0].n;
    return { result, row, suggestions, items: Number(items) };
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

test("a clear match is linked to the item already in the catalogue", { skip }, async () => {
  await emptyCatalogue();
  const id = await catalogue("Stapler HD-45");
  const before = (await db!.query<{ n: string }>("SELECT count(*) AS n FROM item"))[0].n;

  const { row, suggestions, items } = await saved("stapler hd-45");
  assert.equal(row.item_id, id);
  assert.equal(Number(row.match_confidence), 1);
  assert.equal(suggestions.length, 0, "a clear match asks nobody anything");
  assert.equal(items, Number(before), "and creates no second catalogue entry");
});

test("a borderline line is saved unlinked, with the candidate recorded", { skip }, async () => {
  await emptyCatalogue();
  const id = await catalogue("Stapler HD-45");
  const before = (await db!.query<{ n: string }>("SELECT count(*) AS n FROM item"))[0].n;

  const { result, row, suggestions, items } = await saved("Stapler HD45");

  // Unlinked: linking would merge two products on a guess.
  assert.equal(row.item_id, null);
  assert.equal(row.match_confidence, null);
  // And no new item: creating one would split a price history on the same guess.
  assert.equal(items, Number(before));
  // The question is recorded against the candidate, at the score that raised it.
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].item_id, id);
  assert.ok(Number(suggestions[0].score) > 0.6 && Number(suggestions[0].score) < 0.85);
  assert.equal(result.suggested, true);
});

test("something unlike anything in the catalogue becomes its own item", { skip }, async () => {
  await emptyCatalogue();
  await catalogue("Stapler HD-45");
  const before = (await db!.query<{ n: string }>("SELECT count(*) AS n FROM item"))[0].n;

  const { row, suggestions, items } = await saved("Office Chair Mesh Black");
  assert.ok(row.item_id, "a new item is created and linked");
  assert.equal(row.match_confidence, null, "a new item is not a confidence score");
  assert.equal(items, Number(before) + 1);
  assert.equal(suggestions.length, 0);
});

test("thresholds are stored as one value, so a pair is never half saved", { skip }, async () => {
  const { THRESHOLDS_SETTING } = match!;
  // Both numbers in one row: validated together, written together, read back
  // together. Two rows could be interrupted between writes and leave a pair
  // that every later read refuses.
  assert.equal(typeof THRESHOLDS_SETTING, "string");

  const { setSetting } = await import("../lib/settings/store.ts");
  await setSetting(THRESHOLDS_SETTING, { link: 0.9, suggest: 0.55 });
  assert.deepEqual(await match!.getThresholds(), { link: 0.9, suggest: 0.55 });

  // A saved pair that somehow contradicts itself is refused on read rather
  // than quietly matching on it.
  await setSetting(THRESHOLDS_SETTING, { link: 0.4, suggest: 0.8 });
  await assert.rejects(() => match!.getThresholds(), /threshold/);

  // Nothing saved at all means the defaults.
  await setSetting(THRESHOLDS_SETTING, null);
  assert.deepEqual(await match!.getThresholds(), {
    link: match!.DEFAULT_LINK,
    suggest: match!.DEFAULT_SUGGEST,
  });
});

// Trigram scoring compares letters, so no threshold ever joins "Xerox" to
// "photocopy": they share almost nothing to compare. An alias is the one part
// of matching a person can teach rather than tune, and these are against real
// Postgres scores because the scores are the behaviour.
test("a taught name matches, and so do the spellings around it", { skip }, async () => {
  const alias = await import("../lib/items/alias.ts");
  const xerox = await catalogue("Xerox A4 80gsm colour");

  // Nothing joins these two before anybody says so.
  assert.equal((await matchFor("Colour photocopy A4")).kind, "new");

  assert.deepEqual(await alias.addAlias(xerox, "colour photocopy"), { ok: true });

  // The taught name itself.
  const taught = await matchFor("Colour photocopy");
  assert.equal(taught.kind, "linked");
  assert.equal(taught.kind === "linked" && taught.itemId, xerox);

  // And a longer line built around it, which is the point of putting an alias
  // through the same trigram search rather than treating it as an exact match.
  const around = await matchFor("Colour photocopy A4");
  assert.equal(around.kind, "linked");
  assert.equal(around.kind === "linked" && around.itemId, xerox);
});

test("an item with several names is still one candidate", { skip }, async () => {
  const alias = await import("../lib/items/alias.ts");
  const toner = await catalogue("Toner cartridge 12A");
  await alias.addAlias(toner, "black toner twelve a");
  await alias.addAlias(toner, "cartridge twelve a black");

  const found = await matchFor("Toner cartridge 12A");
  assert.equal(found.kind, "linked");
  assert.equal(found.kind === "linked" && found.itemId, toner);
});

test("one name cannot mean two products", { skip }, async () => {
  const alias = await import("../lib/items/alias.ts");
  const first = await catalogue("Bond paper 90gsm");
  const second = await catalogue("Tracing paper 90gsm");

  assert.deepEqual(await alias.addAlias(first, "thick paper"), { ok: true });

  const refused = await alias.addAlias(second, "Thick Paper");
  assert.equal(refused.ok, false);
  // The message has to name the other product. "That is taken" leaves nothing
  // to do about it.
  assert.match(refused.ok === false ? refused.message : "", /Bond paper 90gsm/);
});

test("an alias that is already an item's own name is refused", { skip }, async () => {
  const alias = await import("../lib/items/alias.ts");
  const envelopes = await catalogue("Envelopes DL white");
  const labels = await catalogue("Labels 24 up");

  const clash = await alias.addAlias(labels, "Envelopes DL white");
  assert.equal(clash.ok, false);
  assert.match(clash.ok === false ? clash.message : "", /Merge/i);

  const itself = await alias.addAlias(envelopes, "envelopes dl white");
  assert.equal(itself.ok, false);
  assert.match(itself.ok === false ? itself.message : "", /already called/i);
});

test("a removed name stops matching", { skip }, async () => {
  const alias = await import("../lib/items/alias.ts");
  const item = await catalogue("Packing tape 48mm clear");
  await alias.addAlias(item, "sellotape wide");
  assert.equal((await matchFor("Sellotape wide")).kind, "linked");

  const [row] = await db!.query<{ id: string }>(
    "SELECT id FROM item_alias WHERE item_id = $1",
    [item],
  );
  await alias.removeAlias(item, row.id);
  assert.equal((await matchFor("Sellotape wide")).kind, "new");
});

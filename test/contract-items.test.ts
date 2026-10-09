// What confirming a contract does with a rate the catalogue does not have (#149).
//
// An unmatched rate used to be kept and never looked up, so a contract full of
// them was confirmed, looked live, and checked nothing. It is a new item now,
// unless the catalogue already has something close, in which case the reviewer
// has to say which. Real Postgres, because the trigram scoring and the alias
// constraint are the behaviour.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
process.env.SETTINGS_MASTER_KEY ??= Buffer.alloc(32, 9).toString("base64");

const db = configured ? await import("../lib/db.ts") : null;
const items = configured ? await import("../lib/contracts/items.ts") : null;
const near = configured ? await import("../lib/items/near.ts") : null;
const { normalize } = await import("../lib/items/normalize.ts");

// The lowest score worth hearing about. Passed in, as the code does.
const SUGGEST = 0.5;

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
  await db.query(`
    CREATE TABLE item_alias (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id uuid NOT NULL REFERENCES item (id) ON DELETE CASCADE,
      alias text NOT NULL,
      normalized_name text NOT NULL UNIQUE
    )`);
  await db.query(`
    CREATE TABLE contract (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL DEFAULT 'c'
    )`);
  await db.query(`
    CREATE TABLE contract_rate (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      contract_id uuid NOT NULL REFERENCES contract (id) ON DELETE CASCADE,
      item_id uuid REFERENCES item (id),
      printed_name text NOT NULL,
      new_item_name text,
      CONSTRAINT contract_rate_new_item_unlinked CHECK (new_item_name IS NULL OR item_id IS NULL)
    )`);
});

beforeEach(async () => {
  if (!db) return;
  await db.query("DELETE FROM contract_rate");
  await db.query("DELETE FROM contract");
  await db.query("DELETE FROM item_alias");
  await db.query("DELETE FROM item");
});

after(async () => {
  if (db) {
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db.pool.end();
  }
});

async function item(name: string) {
  const [row] = await db!.query<{ id: string }>(
    "INSERT INTO item (canonical_name, normalized_name) VALUES ($1,$2) RETURNING id",
    [name, normalize(name)],
  );
  return row.id;
}

async function contractWith(rates: { printed: string; itemId?: string; newName?: string }[]) {
  const [c] = await db!.query<{ id: string }>("INSERT INTO contract DEFAULT VALUES RETURNING id");
  const ids: string[] = [];
  for (const r of rates) {
    const [row] = await db!.query<{ id: string }>(
      `INSERT INTO contract_rate (contract_id, item_id, printed_name, new_item_name)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [c.id, r.itemId ?? null, r.printed, r.newName ?? null],
    );
    ids.push(row.id);
  }
  return { contractId: c.id, rateIds: ids };
}

async function resolve(contractId: string) {
  const client = await db!.pool.connect();
  try {
    await client.query("BEGIN");
    const out = await items!.resolveRateItems(client, contractId, SUGGEST);
    await client.query(out.ok ? "COMMIT" : "ROLLBACK");
    return out;
  } finally {
    client.release();
  }
}

async function rateRow(id: string) {
  const rows = await db!.query<{ item_id: string | null; new_item_name: string | null }>(
    "SELECT item_id, new_item_name FROM contract_rate WHERE id = $1",
    [id],
  );
  return rows[0];
}

async function names() {
  const rows = await db!.query<{ canonical_name: string }>(
    "SELECT canonical_name FROM item ORDER BY canonical_name",
  );
  return rows.map((r) => r.canonical_name);
}

test("a rate nothing in the catalogue resembles becomes a new item and is linked to it", { skip }, async () => {
  await item("Whiteboard Marker Black");
  const { contractId, rateIds } = await contractWith([{ printed: "Hydraulic Floor Jack 2 Tonne" }]);

  assert.deepEqual(await resolve(contractId), { ok: true });

  const rate = await rateRow(rateIds[0]);
  assert.ok(rate.item_id, "the rate is linked, not left null");
  assert.deepEqual(await names(), ["Hydraulic Floor Jack 2 Tonne", "Whiteboard Marker Black"]);
});

test("the name the reviewer chose is used, and the printed name is kept as an alias", { skip }, async () => {
  const printed = "Hydraulic Floor Jack 2 Tonne Capacity Trolley Type";
  const { contractId, rateIds } = await contractWith([{ printed, newName: "Floor Jack 2T" }]);
  assert.deepEqual(await resolve(contractId), { ok: true });

  const rate = await rateRow(rateIds[0]);
  const made = await db!.query<{ canonical_name: string }>(
    "SELECT canonical_name FROM item WHERE id = $1",
    [rate.item_id],
  );
  assert.equal(made[0].canonical_name, "Floor Jack 2T");
  const aliases = await db!.query<{ alias: string }>(
    "SELECT alias FROM item_alias WHERE item_id = $1",
    [rate.item_id],
  );
  assert.deepEqual(aliases.map((a) => a.alias), [printed]);
  assert.equal(rate.new_item_name, null);
});

test("a rate with close matches and no decision stops the confirm, naming them", { skip }, async () => {
  await item("Ballpoint Pen Blue Fine Tip");
  const { contractId, rateIds } = await contractWith([{ printed: "Blue Ballpoint Pen" }]);

  const out = await resolve(contractId);
  assert.equal(out.ok, false);
  const message = (out as { message: string }).message;
  assert.match(message, /Blue Ballpoint Pen/);
  assert.match(message, /Ballpoint Pen Blue Fine Tip/);
  assert.match(message, /\d+%/);

  assert.deepEqual(await names(), ["Ballpoint Pen Blue Fine Tip"], "nothing was created");
  assert.equal((await rateRow(rateIds[0])).item_id, null);
});

test("choosing a new item anyway is a decision and goes through", { skip }, async () => {
  await item("Ballpoint Pen Blue Fine Tip");
  const { contractId, rateIds } = await contractWith([
    { printed: "Blue Ballpoint Pen", newName: "Blue Ballpoint Pen" },
  ]);
  assert.deepEqual(await resolve(contractId), { ok: true });
  assert.ok((await rateRow(rateIds[0])).item_id);
  assert.equal((await names()).length, 2);
});

test("an item already called exactly that is reused, not duplicated", { skip }, async () => {
  const existing = await item("A4 Paper 80 GSM White");
  const { contractId, rateIds } = await contractWith([
    { printed: "a4 paper 80 gsm white", newName: "A4 Paper 80 GSM White" },
  ]);
  assert.deepEqual(await resolve(contractId), { ok: true });
  assert.equal((await rateRow(rateIds[0])).item_id, existing);
  assert.equal((await names()).length, 1);
});

test("a rate linked to an existing item teaches the matcher its printed name", { skip }, async () => {
  const pen = await item("Ballpoint Pen Blue Fine Tip");
  const { contractId } = await contractWith([{ printed: "Reynolds Trimax Blue", itemId: pen }]);
  assert.deepEqual(await resolve(contractId), { ok: true });
  const aliases = await db!.query<{ alias: string }>(
    "SELECT alias FROM item_alias WHERE item_id = $1",
    [pen],
  );
  assert.deepEqual(aliases.map((a) => a.alias), ["Reynolds Trimax Blue"]);
});

test("an alias that belongs to another item is skipped, and the confirm still goes through", { skip }, async () => {
  const pen = await item("Ballpoint Pen Blue Fine Tip");
  const marker = await item("Whiteboard Marker Black");
  await db!.query(
    "INSERT INTO item_alias (item_id, alias, normalized_name) VALUES ($1,$2,$3)",
    [marker, "Reynolds Trimax Blue", normalize("Reynolds Trimax Blue")],
  );
  const { contractId } = await contractWith([{ printed: "Reynolds Trimax Blue", itemId: pen }]);
  assert.deepEqual(await resolve(contractId), { ok: true });
  const aliases = await db!.query<{ item_id: string }>("SELECT item_id FROM item_alias");
  assert.deepEqual(aliases.map((a) => a.item_id), [marker], "it did not move to the other item");
});

test("near misses come best first with their scores, and only above the threshold", { skip }, async () => {
  await item("Ballpoint Pen Blue Fine Tip");
  await item("Whiteboard Marker Black");
  const got = (await near!.nearMissesFor(db!.pool, ["Blue Ballpoint Pen"], SUGGEST)).get("Blue Ballpoint Pen")!;
  assert.equal(got.length, 1);
  assert.equal(got[0].name, "Ballpoint Pen Blue Fine Tip");
  assert.ok(got[0].score >= SUGGEST && got[0].score < 1);
});

test("an alias counts when looking for near misses", { skip }, async () => {
  const photocopy = await item("Photocopying Service");
  await db!.query(
    "INSERT INTO item_alias (item_id, alias, normalized_name) VALUES ($1,$2,$3)",
    [photocopy, "Xerox Copy Charge", normalize("Xerox Copy Charge")],
  );
  const found = await near!.nearMissesFor(db!.pool, ["Xerox Copy Charges"], SUGGEST);
  assert.equal(found.get("Xerox Copy Charges")?.[0]?.itemId, photocopy);
});

// Greptile on #222. Each row saves on its own button, so what the screen shows
// and what is stored can differ at the moment Confirm is pressed.
async function decide(contractId: string, decisions: object[]) {
  const client = await db!.pool.connect();
  try {
    await client.query("BEGIN");
    const applied = await items!.applyDecisions(client, contractId, decisions.map((d) => JSON.stringify(d)));
    const out = applied.ok ? await items!.resolveRateItems(client, contractId, SUGGEST) : applied;
    await client.query(out.ok ? "COMMIT" : "ROLLBACK");
    return out;
  } finally {
    client.release();
  }
}

test("a rename that was never saved is still the name the item gets", { skip }, async () => {
  const { contractId, rateIds } = await contractWith([{ printed: "Hydraulic Floor Jack 2 Tonne Capacity" }]);
  const out = await decide(contractId, [{ rateId: rateIds[0], choice: "new", name: "Floor Jack 2T" }]);
  assert.deepEqual(out, { ok: true });
  assert.deepEqual(await names(), ["Floor Jack 2T"]);
});

test("a close match clicked but never saved is honoured, not rejected as undecided", { skip }, async () => {
  const pen = await item("Ballpoint Pen Blue Fine Tip");
  const { contractId, rateIds } = await contractWith([{ printed: "Blue Ballpoint Pen" }]);
  assert.equal((await resolve(contractId)).ok, false, "undecided on the stored rows alone");

  const out = await decide(contractId, [{ rateId: rateIds[0], choice: pen, name: "Blue Ballpoint Pen" }]);
  assert.deepEqual(out, { ok: true });
  assert.equal((await rateRow(rateIds[0])).item_id, pen);
  assert.equal((await names()).length, 1, "no second item was made");
});

test("choices that cannot be read, or name an item that is gone, are refused", { skip }, async () => {
  const { contractId, rateIds } = await contractWith([{ printed: "Hydraulic Floor Jack" }]);
  const gone = "00000000-0000-4000-8000-000000000000";
  for (const bad of [
    { rateId: "nope", choice: "new", name: "x" },
    { rateId: rateIds[0], choice: "new", name: "   " },
    { rateId: rateIds[0], choice: "not-an-id", name: "x" },
    { rateId: rateIds[0], choice: gone, name: "x" },
  ]) {
    assert.equal((await decide(contractId, [bad])).ok, false, JSON.stringify(bad));
  }
  assert.deepEqual(await names(), []);
});

test("a decision cannot reach a rate on another contract", { skip }, async () => {
  const mine = await contractWith([{ printed: "Hydraulic Floor Jack" }]);
  const theirs = await contractWith([{ printed: "Whiteboard Marker" }]);
  await decide(mine.contractId, [{ rateId: theirs.rateIds[0], choice: "new", name: "Hijacked" }]);
  assert.equal((await rateRow(theirs.rateIds[0])).new_item_name, null);
});

// Also #222. A name somebody taught the matcher already belongs to an item.
test("a new item named like an existing alias links to that item, not a second one", { skip }, async () => {
  const photocopy = await item("Photocopying Service");
  await db!.query(
    "INSERT INTO item_alias (item_id, alias, normalized_name) VALUES ($1,$2,$3)",
    [photocopy, "Xerox Copy Charge", normalize("Xerox Copy Charge")],
  );
  const { contractId, rateIds } = await contractWith([
    { printed: "Xerox Copy Charge", newName: "Xerox Copy Charge" },
  ]);
  assert.deepEqual(await resolve(contractId), { ok: true });
  assert.equal((await rateRow(rateIds[0])).item_id, photocopy);
  assert.deepEqual(await names(), ["Photocopying Service"]);
});

// Also #222. item.normalized_name is not unique, so two confirms of the same
// new name at once used to be able to make two items.
test("two contracts confirmed together do not make the same item twice", { skip }, async () => {
  const a = await contractWith([{ printed: "Hydraulic Floor Jack 2 Tonne" }]);
  const b = await contractWith([{ printed: "Hydraulic Floor Jack 2 Tonne" }]);
  const [ra, rb] = await Promise.all([resolve(a.contractId), resolve(b.contractId)]);
  assert.deepEqual([ra, rb], [{ ok: true }, { ok: true }]);
  assert.deepEqual(await names(), ["Hydraulic Floor Jack 2 Tonne"]);
  assert.equal((await rateRow(a.rateIds[0])).item_id, (await rateRow(b.rateIds[0])).item_id);
});

// Also #222. A correction saved while a confirm is running must wait for it,
// not be overwritten by what the confirm read a moment earlier.
test("a correction saved during a confirm waits for it", { skip }, async () => {
  const pen = await item("Ballpoint Pen Blue Fine Tip");
  const { contractId, rateIds } = await contractWith([{ printed: "Hydraulic Floor Jack 2 Tonne" }]);

  const confirming = await db!.pool.connect();
  try {
    await confirming.query("BEGIN");
    assert.deepEqual(await items!.resolveRateItems(confirming, contractId, SUGGEST), { ok: true });

    let saved = false;
    const correction = db!
      .query("UPDATE contract_rate SET item_id = $2 WHERE id = $1", [rateIds[0], pen])
      .then(() => { saved = true; });
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(saved, false, "the correction must not land while the confirm holds the rate");

    await confirming.query("COMMIT");
    await correction;
    assert.equal((await rateRow(rateIds[0])).item_id, pen, "the later correction wins, as it should");
  } finally {
    confirming.release();
  }
});

// The confirm reads the rates, then waits on the name lock, then writes. A
// correction saved in that gap must not be overwritten by what was read before
// it. Holding the name lock from another connection pauses the confirm there.
test("a correction saved between the confirm reading a rate and writing it is not overwritten", { skip }, async () => {
  const pen = await item("Ballpoint Pen Blue Fine Tip");
  const printed = "Hydraulic Floor Jack 2 Tonne";
  const { contractId, rateIds } = await contractWith([{ printed }]);

  const holder = await db!.pool.connect();
  const confirming = await db!.pool.connect();
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`item:${normalize(printed)}`]);

    await confirming.query("BEGIN");
    const finished = items!.resolveRateItems(confirming, contractId, SUGGEST);
    await new Promise((r) => setTimeout(r, 1500)); // read done, now waiting on the name

    let saved = false;
    const correction = db!
      .query("UPDATE contract_rate SET item_id = $2 WHERE id = $1", [rateIds[0], pen])
      .then(() => { saved = true; });
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(saved, false, "the correction must wait for the confirm, not slip in beside it");

    await holder.query("COMMIT");
    assert.deepEqual(await finished, { ok: true });
    await confirming.query("COMMIT");
    await correction;
    assert.equal((await rateRow(rateIds[0])).item_id, pen, "the later correction is the one that stands");
  } finally {
    holder.release();
    confirming.release();
  }
});

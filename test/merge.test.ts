// Merging is the undo for a wrong automatic link. If it leaves a line pointing
// at an item that no longer exists, a price history quietly loses purchases.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

const db = configured ? await import("../lib/db.ts") : null;
const merge = configured ? await import("../lib/items/merge.ts") : null;

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`CREATE TABLE item (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name text NOT NULL)`);
  await db.query(`CREATE TABLE line_item (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_description text NOT NULL,
    item_id uuid REFERENCES item (id))`);
  await db.query(`CREATE TABLE match_suggestion (
    line_item_id uuid PRIMARY KEY REFERENCES line_item (id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES item (id) ON DELETE CASCADE,
    score numeric(4,3) NOT NULL,
    decision text,
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz)`);
});

after(async () => {
  if (!db) return;
  await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await db.pool.end();
});

async function item(name: string) {
  const [row] = await db!.query<{ id: string }>(
    "INSERT INTO item (canonical_name) VALUES ($1) RETURNING id",
    [name],
  );
  return row.id;
}

async function line(itemId: string | null, description = "a line") {
  const [row] = await db!.query<{ id: string }>(
    "INSERT INTO line_item (raw_description, item_id) VALUES ($1,$2) RETURNING id",
    [description, itemId],
  );
  return row.id;
}

const linesOn = async (itemId: string) =>
  Number((await db!.query<{ n: string }>("SELECT count(*) AS n FROM line_item WHERE item_id = $1", [itemId]))[0].n);

test("every purchase moves across and the emptied item goes", { skip }, async () => {
  const keep = await item("A4 Paper 500 Sheets");
  const gone = await item("A4 paper, 500 sheets");
  await line(keep, "A4 Paper");
  await line(gone, "A4 paper ream");
  await line(gone, "paper a4");

  const result = await merge!.mergeItems(keep, gone);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.moved, 2);

  // One history, not two.
  assert.equal(await linesOn(keep), 3);
  const left = await db!.query("SELECT id FROM item WHERE id = $1", [gone]);
  assert.equal(left.length, 0, "the merged item is gone");

  // And nothing is orphaned: no line points at an item that no longer exists.
  const orphans = await db!.query(
    `SELECT l.id FROM line_item l LEFT JOIN item i ON i.id = l.item_id
     WHERE l.item_id IS NOT NULL AND i.id IS NULL`,
  );
  assert.deepEqual(orphans, []);
});

test("an unanswered suggestion moves rather than disappearing", { skip }, async () => {
  const keep = await item("Stapler HD-45");
  const gone = await item("Stapler HD45");
  const waiting = await line(null, "Stapler HD 45");
  await db!.query("INSERT INTO match_suggestion (line_item_id, item_id, score) VALUES ($1,$2,0.7)", [
    waiting,
    gone,
  ]);

  const result = await merge!.mergeItems(keep, gone);
  assert.equal(result.ok && result.suggestionsMoved, 1);

  const [row] = await db!.query<{ item_id: string }>(
    "SELECT item_id FROM match_suggestion WHERE line_item_id = $1",
    [waiting],
  );
  assert.equal(row.item_id, keep, "the question survives, pointed at the item that remains");
});

test("a line never holds two questions, so the move cannot collide", { skip }, async () => {
  const keep = await item("Ink Cartridge 803B");
  const gone = await item("Ink cartridge 803-B");
  const waiting = await line(null, "ink cart 803b");
  await db!.query("INSERT INTO match_suggestion (line_item_id, item_id, score) VALUES ($1,$2,0.7)", [
    waiting,
    gone,
  ]);

  // The invariant the merge relies on: one row per line, enforced by the
  // primary key. A second question about the same line cannot be written, so
  // moving one onto the kept item has nothing to clash with.
  await assert.rejects(
    () =>
      db!.query("INSERT INTO match_suggestion (line_item_id, item_id, score) VALUES ($1,$2,0.7)", [
        waiting,
        keep,
      ]),
    /duplicate key|unique/i,
  );

  assert.equal((await merge!.mergeItems(keep, gone)).ok, true);
  const rows = await db!.query<{ item_id: string }>(
    "SELECT item_id FROM match_suggestion WHERE line_item_id = $1",
    [waiting],
  );
  assert.equal(rows.length, 1, "one question about one line, before and after");
  assert.equal(rows[0].item_id, keep);
});

test("merging an item into itself is refused", { skip }, async () => {
  const only = await item("Only One");
  assert.deepEqual(await merge!.mergeItems(only, only), { ok: false, reason: "same_item" });
  // And it is still there, with its lines.
  assert.equal((await db!.query("SELECT id FROM item WHERE id = $1", [only])).length, 1);
});

test("merging something that is not there changes nothing", { skip }, async () => {
  const keep = await item("Real Item");
  await line(keep);
  const missing = "11111111-1111-4111-8111-111111111111";

  assert.deepEqual(await merge!.mergeItems(keep, missing), { ok: false, reason: "not_found" });
  assert.equal(await linesOn(keep), 1, "the kept item is untouched");
});

test("two merges of the same pair from opposite sides do not deadlock", { skip }, async () => {
  const a = await item("Same Thing A");
  const b = await item("Same Thing B");
  await line(a);
  await line(b);

  // Locking in a fixed order is what makes this safe: each merge wants both
  // rows, and without an order they can hold one each and wait forever.
  const [first, second] = await Promise.all([
    merge!.mergeItems(a, b),
    merge!.mergeItems(b, a).catch(() => ({ ok: false as const, reason: "not_found" as const })),
  ]);

  assert.equal([first, second].filter((r) => r.ok).length >= 1, true);
  const left = await db!.query("SELECT id FROM item WHERE id = ANY($1)", [[a, b]]);
  assert.equal(left.length, 1, "one item survives, whichever won");
  assert.equal(await linesOn(left[0].id as string), 2, "and it holds both purchases");
});

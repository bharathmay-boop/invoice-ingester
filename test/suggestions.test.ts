// Deciding a borderline match writes two rows that have to agree: the decision
// and the link. A test schema rather than the live one, so a run cannot touch
// real invoices.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

const db = configured ? await import("../lib/db.ts") : null;
const suggestions = configured ? await import("../lib/items/suggestions.ts") : null;

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`CREATE TABLE item (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name text NOT NULL)`);
  await db.query(`CREATE TABLE line_item (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_description text NOT NULL,
    item_id uuid REFERENCES item (id),
    match_confidence numeric(4,3))`);
  await db.query(`CREATE TABLE match_suggestion (
    line_item_id uuid PRIMARY KEY REFERENCES line_item (id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES item (id) ON DELETE CASCADE,
    score numeric(4,3) NOT NULL,
    decision text CHECK (decision IN ('accepted', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz)`);
});

after(async () => {
  if (!db) return;
  await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await db.pool.end();
});

/** A line waiting on a decision, and the catalogue item it might be. */
async function waiting(score = 0.7) {
  const [item] = await db!.query<{ id: string }>(
    "INSERT INTO item (canonical_name) VALUES ('Stapler HD-45') RETURNING id",
  );
  const [line] = await db!.query<{ id: string }>(
    "INSERT INTO line_item (raw_description) VALUES ('Stapler HD45') RETURNING id",
  );
  await db!.query(
    "INSERT INTO match_suggestion (line_item_id, item_id, score) VALUES ($1,$2,$3)",
    [line.id, item.id, score],
  );
  return { itemId: item.id, lineId: line.id };
}

const lineRow = (id: string) =>
  db!.query<{ item_id: string | null; match_confidence: string | null }>(
    "SELECT item_id, match_confidence FROM line_item WHERE id = $1",
    [id],
  );

test("accepting links the line and keeps the score it was accepted at", { skip }, async () => {
  const { itemId, lineId } = await waiting(0.712);
  assert.deepEqual(await suggestions!.applyDecision(lineId, "accepted"), {
    ok: true,
    verdict: "accepted",
  });

  const [line] = await lineRow(lineId);
  assert.equal(line.item_id, itemId);
  assert.equal(Number(line.match_confidence), 0.712);

  const [row] = await db!.query<{ decision: string; decided_at: string | null }>(
    "SELECT decision, decided_at FROM match_suggestion WHERE line_item_id = $1",
    [lineId],
  );
  assert.equal(row.decision, "accepted");
  assert.ok(row.decided_at, "a decision records when it was made");
});

test("rejecting records the answer and leaves the line alone", { skip }, async () => {
  const { lineId } = await waiting();
  assert.deepEqual(await suggestions!.applyDecision(lineId, "rejected"), {
    ok: true,
    verdict: "rejected",
  });

  const [line] = await lineRow(lineId);
  assert.equal(line.item_id, null, "a rejected line stays unlinked");
  assert.equal(line.match_confidence, null);

  // Recorded so the queue does not ask again tomorrow.
  const [row] = await db!.query<{ decision: string }>(
    "SELECT decision FROM match_suggestion WHERE line_item_id = $1",
    [lineId],
  );
  assert.equal(row.decision, "rejected");
});

test("a second answer to the same question is refused", { skip }, async () => {
  const { lineId } = await waiting();
  await suggestions!.applyDecision(lineId, "rejected");

  assert.deepEqual(await suggestions!.applyDecision(lineId, "accepted"), {
    ok: false,
    reason: "already_decided",
  });

  // And the first answer stands: the late one cannot link what was rejected.
  const [line] = await lineRow(lineId);
  assert.equal(line.item_id, null);
});

test("two tabs answering at once, only one wins", { skip }, async () => {
  const { lineId } = await waiting();
  const [a, b] = await Promise.all([
    suggestions!.applyDecision(lineId, "accepted"),
    suggestions!.applyDecision(lineId, "rejected"),
  ]);

  assert.equal([a, b].filter((r) => r.ok).length, 1, "exactly one decision should take");

  // Whichever won, the line agrees with the decision that was stored.
  const [row] = await db!.query<{ decision: string }>(
    "SELECT decision FROM match_suggestion WHERE line_item_id = $1",
    [lineId],
  );
  const [line] = await lineRow(lineId);
  assert.equal(line.item_id === null, row.decision === "rejected");
});

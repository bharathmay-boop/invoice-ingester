// The contract queue drains itself, which means nothing watches it. A job left
// in the wrong state is invisible: no error, no screen, just a contract that is
// never read. So the state machine is tested against real Postgres, including
// the concurrency the self-chaining design depends on.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const configured = Boolean(process.env.DATABASE_URL);
const skip = configured ? false : "no DATABASE_URL, run `vercel env pull`";

const SCHEMA = `test_${Math.random().toString(36).slice(2, 10)}`;
process.env.DATABASE_SCHEMA = SCHEMA;
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
process.env.SETTINGS_MASTER_KEY ??= Buffer.alloc(32, 9).toString("base64");

const db = configured ? await import("../lib/db.ts") : null;
const queue = configured ? await import("../lib/contracts/queue.ts") : null;

before(async () => {
  if (!db) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`
    CREATE TABLE contract (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id uuid,
      title text NOT NULL,
      blob_url text NOT NULL,
      content_type text NOT NULL,
      pages integer,
      status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','reading','ready_for_review','reviewed','could_not_read')),
      attempts integer NOT NULL DEFAULT 0,
      heartbeat_at timestamptz,
      failure text,
      extraction jsonb,
      extraction_meta jsonb,
      other_terms jsonb NOT NULL DEFAULT '[]',
      digest text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz
    )`);
  // `recordRates` writes rate rows and matches each printed name against the
  // catalogue as it goes, so the item side has to be here too, trigram index
  // and all, or the matching it does is not the matching production does.
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
    CREATE TABLE contract_rate (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      contract_id uuid NOT NULL REFERENCES contract (id) ON DELETE CASCADE,
      vendor_id uuid,
      item_id uuid REFERENCES item (id),
      printed_name text NOT NULL,
      unit text,
      rate numeric(14,4) NOT NULL,
      currency text NOT NULL,
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
  await db.query("DELETE FROM item_alias");
  await db.query("DELETE FROM item");
  await db.query("DELETE FROM contract");
});

after(async () => {
  if (!db) return;
  await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await db.pool.end();
});

async function queued(title: string, at?: string) {
  const [row] = await db!.query<{ id: string }>(
    `INSERT INTO contract (title, blob_url, content_type, digest, created_at)
     VALUES ($1, 'blob://x', 'application/pdf', $2, coalesce($3::timestamptz, now()))
     RETURNING id`,
    [title, `${title}-${Math.random()}`, at ?? null],
  );
  return row.id;
}

const statusOf = async (id: string) =>
  (
    await db!.query<{ status: string; attempts: number; failure: string | null }>(
      "SELECT status, attempts, failure FROM contract WHERE id = $1",
      [id],
    )
  )[0];

test("the oldest waiting contract is taken first", { skip }, async () => {
  await queued("newer", "2026-02-01");
  const older = await queued("older", "2026-01-01");

  const claimed = await queue!.claimNext();
  assert.equal(claimed?.id, older);
  assert.equal(claimed?.attempts, 1, "claiming is what counts as an attempt");
  assert.equal((await statusOf(older)).status, "reading");
});

test("two workers racing do not take the same contract", { skip }, async () => {
  // This is the whole reason for FOR UPDATE SKIP LOCKED. Without it both
  // workers read the same row and a model is paid twice to read one document,
  // and nothing anywhere would say so.
  const a = await queued("a", "2026-01-01");
  const b = await queued("b", "2026-01-02");

  const [first, second] = await Promise.all([queue!.claimNext(), queue!.claimNext()]);
  const taken = [first?.id, second?.id].sort();
  assert.deepEqual(taken, [a, b].sort(), "each worker took a different contract");
});

test("nothing waiting is not an error", { skip }, async () => {
  assert.equal(await queue!.claimNext(), null);
  assert.equal(await queue!.waitingCount(), 0);
});

test("a retryable failure goes back in the queue, a spent one stops", { skip }, async () => {
  const id = await queued("flaky");

  const first = await queue!.claimNext();
  await queue!.markFailed(id, first!.attempts, "the provider was busy");
  assert.equal((await statusOf(id)).status, "queued", "one attempt used, still worth another");
  assert.equal((await statusOf(id)).failure, "the provider was busy", "the reason stays while it waits");

  const second = await queue!.claimNext();
  assert.equal(second?.attempts, 2);
  await queue!.markFailed(id, second!.attempts, "the provider was busy");
  assert.equal((await statusOf(id)).status, "could_not_read", "attempts are spent");
});

test("a failure that will not fix itself does not wait for its attempts", { skip }, async () => {
  // The worker passes a count past the limit for a failure the provider called
  // permanent. Retrying a refused key twice is money spent to learn nothing.
  const id = await queued("bad key");
  await queue!.claimNext();
  await queue!.markFailed(id, Number.MAX_SAFE_INTEGER, "No OpenRouter key is saved.");
  assert.equal((await statusOf(id)).status, "could_not_read");
});

test("a contract left behind by a dead worker is handed back", { skip }, async () => {
  const id = await queued("stranded");
  await queue!.claimNext();
  // A function that ran out of its sixty seconds stops beating. Nothing else
  // would ever notice: the chain behind it has already ended.
  await db!.query(
    "UPDATE contract SET heartbeat_at = now() - interval '30 minutes' WHERE id = $1",
    [id],
  );

  assert.equal(await queue!.reclaimStale(), 1);
  assert.equal((await statusOf(id)).status, "queued");
});

test("a worker that is still beating is left alone", { skip }, async () => {
  const id = await queued("working");
  await queue!.claimNext();
  await queue!.beat(id);

  assert.equal(await queue!.reclaimStale(), 0);
  assert.equal((await statusOf(id)).status, "reading");
});

test("a stranded contract that has used its attempts stops rather than looping", { skip }, async () => {
  const id = await queued("too long");
  await queue!.claimNext();
  await queue!.markFailed(id, 1, "timed out");
  await queue!.claimNext();
  await db!.query(
    "UPDATE contract SET heartbeat_at = now() - interval '30 minutes' WHERE id = $1",
    [id],
  );

  await queue!.reclaimStale();
  const after = await statusOf(id);
  assert.equal(after.status, "could_not_read");
  assert.match(after.failure ?? "", /ran out of time/);
});

test("the same file twice is one contract", { skip }, async () => {
  await db!.query(
    `INSERT INTO contract (title, blob_url, content_type, digest)
     VALUES ('rate card', 'blob://a', 'application/pdf', 'abc')
     ON CONFLICT (digest) DO NOTHING`,
  );
  await db!.query(
    `INSERT INTO contract (title, blob_url, content_type, digest)
     VALUES ('rate card copy', 'blob://b', 'application/pdf', 'abc')
     ON CONFLICT (digest) DO NOTHING`,
  );

  const [{ n }] = await db!.query<{ n: number }>("SELECT count(*)::int AS n FROM contract");
  assert.equal(n, 1, "the digest is the identity, not the name or the url");
});

test("ready for review clears whatever failed last time", { skip }, async () => {
  const id = await queued("recovers");
  await queue!.claimNext();
  await queue!.markFailed(id, 1, "the provider was busy");
  await queue!.claimNext();
  await queue!.markReadyForReview(id, { rates: [] }, { model: "x" }, []);

  const after = await statusOf(id);
  assert.equal(after.status, "ready_for_review");
  assert.equal(after.failure, null, "a stale reason beside a successful read reads as a warning");
});

const RATE = {
  printed_name: "A4 Paper 80 GSM white",
  unit: "ream" as string | null,
  rate: 285,
  effective_from: "2026-04-01",
  effective_to: null as string | null,
  page: 44,
  quote: "A4 Paper 80 GSM, white, per ream, Rs. 285.00",
};

async function ratesOf(contractId: string) {
  return db!.query<{
    printed_name: string;
    item_id: string | null;
    rate: string;
    reviewed: boolean;
    source_page: number | null;
  }>(
    `SELECT printed_name, item_id, rate, reviewed, source_page
     FROM contract_rate WHERE contract_id = $1 ORDER BY printed_name`,
    [contractId],
  );
}

test("a rate is written inert, whatever the model said", { skip }, async () => {
  const id = await queued("rate card");
  assert.equal(await queue!.recordRates(id, "INR", [RATE]), 1);

  const [row] = await ratesOf(id);
  assert.equal(row.reviewed, false, "a model read it, nobody agreed with it yet");
  assert.equal(Number(row.rate), 285);
  assert.equal(row.source_page, 44, "a rate nobody can point at is a claim");
});

test("a rate whose printed name is in the catalogue is linked to it", { skip }, async () => {
  // Through `normalize`, not a hand written key: the catalogue is written that
  // way, and a fixture that spells the key itself tests a matcher nothing uses.
  const { normalize } = await import("../lib/items/normalize.ts");
  const [{ id: itemId }] = await db!.query<{ id: string }>(
    "INSERT INTO item (canonical_name, normalized_name) VALUES ($1,$2) RETURNING id",
    [RATE.printed_name, normalize(RATE.printed_name)],
  );
  const id = await queued("rate card");
  await queue!.recordRates(id, "INR", [RATE]);

  const [row] = await ratesOf(id);
  assert.equal(row.item_id, itemId);
});

test("a rate for something not in the catalogue waits for a person", { skip }, async () => {
  const id = await queued("rate card");
  await queue!.recordRates(id, "INR", [{ ...RATE, printed_name: "Teakwood batten 2x2" }]);

  const [row] = await ratesOf(id);
  assert.equal(row.item_id, null, "an unresolved rate is never used for anything");
});

test("re-reading a contract replaces its rates rather than doubling them", { skip }, async () => {
  const id = await queued("rate card");
  await queue!.recordRates(id, "INR", [RATE]);
  // A better prompt, run over the same document. The old figure must not be
  // left sitting beside the new one: the lookup takes the latest start date,
  // not the latest row, so a stale rate would keep winning on equal dates.
  await queue!.recordRates(id, "INR", [{ ...RATE, rate: 299 }]);

  const rows = await ratesOf(id);
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].rate), 299);
});

test("a read that found no rates writes nothing and says so", { skip }, async () => {
  const id = await queued("a letter, not a rate card");
  assert.equal(await queue!.recordRates(id, "INR", []), 0);
  assert.equal((await ratesOf(id)).length, 0);
});

import "server-only";
import { query } from "../db.ts";

/**
 * The contract queue.
 *
 * Vercel's Hobby plan runs a cron once a day and no more often, so a
 * minute-by-minute drain is not available. Instead the queue drains itself:
 * the upload fires a request at a worker without awaiting it, the worker takes
 * one contract and fires the same request again before returning, and the
 * chain runs until nothing is waiting. No timer, no external service, and it
 * starts the moment the files land rather than on the next tick.
 *
 * The daily cron stays, doing the one job a daily cadence actually suits:
 * reclaiming a contract left mid read by a function that died.
 */

export type ContractStatus =
  | "queued"
  | "reading"
  | "ready_for_review"
  | "reviewed"
  | "could_not_read";

/** Hobby caps a function at 60 seconds, so anything older than this is gone. */
export const STALE_AFTER_MINUTES = 5;

/**
 * Two tries, then it stays failed. A third attempt on a document that has
 * already failed twice the same way is money spent to learn nothing, and a job
 * that retries forever is how a queue quietly stops draining for everything
 * behind it.
 */
export const MAX_ATTEMPTS = 2;

export type ClaimedContract = {
  id: string;
  blob_url: string;
  content_type: string;
  title: string;
  attempts: number;
};

/**
 * Take the oldest waiting contract, if there is one.
 *
 * `FOR UPDATE SKIP LOCKED` rather than a select then an update: two workers
 * racing would otherwise both read the same row and both pay a model to read
 * the same document. Skipping a locked row means the second worker takes the
 * next one instead of waiting for the first.
 */
export async function claimNext(): Promise<ClaimedContract | null> {
  const rows = await query<ClaimedContract>(
    `UPDATE contract SET status = 'reading', heartbeat_at = now(), attempts = attempts + 1
     WHERE id = (
       SELECT id FROM contract
       WHERE status = 'queued'
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, blob_url, content_type, title, attempts`,
  );
  return rows[0] ?? null;
}

/** Still working. The sweeper leaves alone anything that said so recently. */
export async function beat(id: string): Promise<void> {
  await query("UPDATE contract SET heartbeat_at = now() WHERE id = $1", [id]);
}

export async function markReadyForReview(
  id: string,
  extraction: unknown,
  meta: unknown,
  otherTerms: unknown,
): Promise<void> {
  await query(
    `UPDATE contract
     SET status = 'ready_for_review', extraction = $2, extraction_meta = $3,
         other_terms = $4, failure = NULL, heartbeat_at = NULL
     WHERE id = $1`,
    [id, JSON.stringify(extraction), JSON.stringify(meta ?? {}), JSON.stringify(otherTerms ?? [])],
  );
}

/**
 * A failure that may be worth another go goes back to `queued`; one that has
 * used its attempts stops there with the reason showing.
 *
 * The reason is kept either way. A contract sitting in the queue with no
 * explanation is indistinguishable from one nobody has reached yet.
 */
export async function markFailed(id: string, attempts: number, reason: string): Promise<void> {
  const terminal = attempts >= MAX_ATTEMPTS;
  await query(
    `UPDATE contract
     SET status = $2, failure = $3, heartbeat_at = NULL
     WHERE id = $1`,
    [id, terminal ? "could_not_read" : "queued", reason],
  );
}

/**
 * Hand back anything a dead function was holding.
 *
 * A worker that times out leaves its contract in `reading` with a heartbeat
 * that stops moving. Without this it would sit there forever and the chain
 * behind it would have already ended, so the queue would simply stop.
 */
export async function reclaimStale(): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE contract
     SET status = CASE WHEN attempts >= $2 THEN 'could_not_read' ELSE 'queued' END,
         failure = CASE WHEN attempts >= $2
           THEN 'Reading this contract ran out of time twice. It may be too long or too faint to read.'
           ELSE failure END,
         heartbeat_at = NULL
     WHERE status = 'reading'
       AND heartbeat_at < now() - ($1 || ' minutes')::interval
     RETURNING id`,
    [String(STALE_AFTER_MINUTES), MAX_ATTEMPTS],
  );
  return rows.length;
}

export async function waitingCount(): Promise<number> {
  const rows = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM contract WHERE status = 'queued'",
  );
  return rows[0]?.n ?? 0;
}

/**
 * Turn what the model read into rate rows.
 *
 * Every rate is written unreviewed, and the lookup in #32 only sees reviewed
 * ones, so nothing here can affect an invoice until a person has had the
 * document in front of them. That is what makes reading a long PDF cheaply a
 * safe thing to build on.
 *
 * Items are matched here with the same trigram search the invoice path uses,
 * but only to fill in a default. A rate that matched confidently still waits
 * for the review, because a contract names things in the vendor's words and
 * the reviewer is the one person who can see both the document and the
 * catalogue at once.
 */
export async function recordRates(
  contractId: string,
  currency: string,
  rates: {
    printed_name: string;
    unit: string | null;
    rate: number;
    effective_from: string;
    effective_to: string | null;
    page: number | null;
    quote: string | null;
  }[],
): Promise<number> {
  if (!rates.length) return 0;

  const { pool } = await import("../db.ts");
  const { normalize } = await import("../items/normalize.ts");
  const { findMatch, getThresholds } = await import("../items/match.ts");
  const thresholds = await getThresholds();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Replaced rather than added to, so re-reading a contract after a better
    // prompt does not leave the old rates beside the new ones. Safe because
    // nothing points at a rate row: the invoice side looks rates up by vendor,
    // item and date rather than holding an id.
    await client.query("DELETE FROM contract_rate WHERE contract_id = $1", [contractId]);

    for (const rate of rates) {
      const match = await findMatch(client, normalize(rate.printed_name), thresholds);
      await client.query(
        `INSERT INTO contract_rate
           (contract_id, item_id, printed_name, unit, rate, currency,
            effective_from, effective_to, source_page, source_quote, reviewed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)`,
        [
          contractId,
          match.kind === "linked" ? match.itemId : null,
          rate.printed_name,
          rate.unit,
          rate.rate,
          currency,
          rate.effective_from,
          rate.effective_to,
          rate.page,
          rate.quote,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return rates.length;
}

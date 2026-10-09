import "server-only";
import type { PoolClient } from "pg";
import { pool } from "../db.ts";
import { getSetting } from "../settings/store.ts";
import { coverageFor } from "./lookup.ts";
import { assess, DEFAULT_TOLERANCE_PERCENT, TOLERANCE_SETTING } from "./variance.ts";

/**
 * The only thing that ever writes a variance tag.
 *
 * Called from exactly three places, which are the three ways a tag can become
 * wrong: an invoice is saved, a contract is reviewed, and the tolerance
 * setting is changed. Anything else writing one is how this rots into four
 * code paths disagreeing about the same row.
 *
 * ponytail: stored rather than worked out when a screen asks. A tag is a pure
 * function of data already present, so this is a cache, and the honest reason
 * for having it is that the alternative joins line items to rates on every
 * view. If that turns out to be fast enough, delete the writes and call
 * `assess` inline: the function is the same either way.
 */
export async function recomputeVariance(vendorId: string): Promise<number> {
  // The setting is read before a connection is held. A caller that holds one
  // while it waits for a second from a pool of three is how three overlapping
  // re-checks wait on each other forever.
  const tolerance = await loadTolerance();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const count = await recomputeOn(client, vendorId, tolerance);
    await client.query("COMMIT");
    return count;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function loadTolerance(): Promise<number> {
  return (await getSetting<number>(TOLERANCE_SETTING)) ?? DEFAULT_TOLERANCE_PERCENT;
}

/**
 * The comparison itself, on a transaction the caller already opened.
 *
 * Two properties are the point of the shape:
 *
 * - One supplier at a time. The advisory lock is taken before anything is read,
 *   and held to the end of the transaction, so a re-check that started later
 *   always reads rates the earlier one could not have seen, and the last to
 *   finish is the one reflecting the latest rate. Without it, a slow re-check
 *   could read an old rate, pause, and overwrite a newer result (#112).
 * - One connection. Coverage is looked up on the same client, so a re-check
 *   never asks the pool for a second connection while holding the first.
 *
 * The caller owns BEGIN, COMMIT and ROLLBACK, which lets a rate correction and
 * the re-check it needs succeed or fail together.
 */
export async function recomputeOn(
  client: PoolClient,
  vendorId: string,
  tolerance: number,
): Promise<number> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`variance:${vendorId}`]);

  const { rows } = await client.query<{
    id: string;
    item_id: string | null;
    unit: string | null;
    unit_price: number;
    quantity: number;
    currency: string;
    invoice_date: string;
  }>(
    `SELECT li.id, li.item_id, li.unit, li.unit_price::float, li.quantity::float,
            i.currency, i.invoice_date
     FROM line_item li JOIN invoice i ON i.id = li.invoice_id
     WHERE i.vendor_id = $1`,
    [vendorId],
  );

  for (const line of rows) {
    const coverage = await coverageFor(vendorId, line.item_id, line.invoice_date, client);
    const finding = assess(coverage, line, tolerance);
    await client.query(
      `UPDATE line_item
       SET variance_tag = $2, variance_contracted = $3, variance_impact = $4,
           variance_reason = $5
       WHERE id = $1`,
      [
        line.id,
        finding?.tag ?? null,
        finding?.contracted ?? null,
        finding?.impact ?? null,
        finding?.reason ?? null,
      ],
    );
  }
  return rows.length;
}

/**
 * Which tags hold an invoice back from being confirmed.
 *
 * `units_differ` is not among them: there is nothing for a person to approve,
 * because the product is saying it cannot compare rather than that something
 * is wrong. `matches_contract` is the whole point and holds nothing.
 */
export const HOLDS_INVOICE = [
  "billed_above_contract",
  "billed_below_contract",
  "outside_contract_period",
  "not_in_contract",
] as const;

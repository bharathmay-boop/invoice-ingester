import "server-only";
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
  const tolerance = (await getSetting<number>(TOLERANCE_SETTING)) ?? DEFAULT_TOLERANCE_PERCENT;

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      id: string;
      item_id: string | null;
      unit: string | null;
      unit_price: number;
      quantity: number;
      invoice_date: string;
    }>(
      `SELECT li.id, li.item_id, li.unit, li.unit_price::float, li.quantity::float,
              i.invoice_date
       FROM line_item li JOIN invoice i ON i.id = li.invoice_id
       WHERE i.vendor_id = $1`,
      [vendorId],
    );

    await client.query("BEGIN");
    for (const line of rows) {
      const coverage = await coverageFor(vendorId, line.item_id, line.invoice_date);
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
    await client.query("COMMIT");
    return rows.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

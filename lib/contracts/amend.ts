import "server-only";
import { pool } from "../db.ts";
import { loadTolerance, recomputeOn } from "./recompute.ts";

/**
 * Correct one rate, and re-check the supplier's invoices if the contract is
 * already live.
 *
 * A variance tag is a stored copy of a comparison against a rate. Changing the
 * rate without redoing the comparison leaves every tag computed from the old
 * figure in place, with nothing anywhere saying so (#112). An unreviewed rate
 * has no tags hanging off it, so only a reviewed one triggers the recompute.
 * It is the whole supplier rather than the one item, because an amend can move
 * a rate onto a different item, and then both the item it left and the item it
 * joined are wrong.
 *
 * Lives apart from the server action so a test can reach it; the action reads
 * cookies.
 */
export async function amendRateRow(input: {
  rateId: string;
  contractId: string;
  itemId: string | null;
  rate: number;
  unit: string;
}): Promise<{ found: boolean; rechecked: boolean }> {
  // Read before a connection is held; see recomputeVariance.
  const tolerance = await loadTolerance();
  const client = await pool.connect();
  try {
    // The correction and the re-check it needs succeed or fail together. A
    // rate saved with the old findings left standing, because the re-check
    // errored after the rate had committed, is the exact state this exists to
    // prevent.
    await client.query("BEGIN");
    const { rows } = await client.query<{ reviewed: boolean; vendor_id: string | null }>(
      `UPDATE contract_rate
       SET item_id = $3, rate = $4, unit = NULLIF($5, '')
       WHERE id = $1 AND contract_id = $2
       RETURNING reviewed, vendor_id`,
      [input.rateId, input.contractId, input.itemId, input.rate, input.unit],
    );
    const row = rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { found: false, rechecked: false };
    }
    if (!row.reviewed || !row.vendor_id) {
      await client.query("COMMIT");
      return { found: true, rechecked: false };
    }

    await recomputeOn(client, row.vendor_id, tolerance);
    await client.query("COMMIT");
    return { found: true, rechecked: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

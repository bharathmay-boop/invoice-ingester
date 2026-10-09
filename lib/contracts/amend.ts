import "server-only";
import { query } from "../db.ts";
import { recomputeVariance } from "./recompute.ts";

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
  const rows = await query<{ reviewed: boolean; vendor_id: string | null }>(
    `UPDATE contract_rate
     SET item_id = $3, rate = $4, unit = NULLIF($5, '')
     WHERE id = $1 AND contract_id = $2
     RETURNING reviewed, vendor_id`,
    [input.rateId, input.contractId, input.itemId, input.rate, input.unit],
  );
  const row = rows[0];
  if (!row) return { found: false, rechecked: false };
  if (!row.reviewed || !row.vendor_id) return { found: true, rechecked: false };

  await recomputeVariance(row.vendor_id);
  return { found: true, rechecked: true };
}

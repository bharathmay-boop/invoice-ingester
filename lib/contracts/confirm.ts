import type pg from "pg";

/**
 * Make a reviewed contract live: attach the vendor, store the period the
 * reviewer confirmed, and let the rates start counting.
 *
 * It sits apart from the server action so a test can reach it; the action
 * reads cookies.
 *
 * The period is stored on the contract itself. Coverage used to be inferred
 * from rate rows alone, so a reviewed contract with no rates looked like no
 * contract at all, and the start date a reviewer was made to type was thrown
 * away (#118). A rate keeps any date of its own; one with none takes the
 * confirmed period, which is the only reason `COALESCE` here does anything now.
 */
export async function applyReview(
  client: Pick<pg.PoolClient, "query">,
  { contractId, vendorId, from, to }: { contractId: string; vendorId: string; from: string; to: string },
): Promise<void> {
  await client.query(
    `UPDATE contract_rate
     SET vendor_id = $2,
         effective_from = COALESCE(effective_from, $3::date),
         effective_to = COALESCE(effective_to, NULLIF($4, '')::date),
         reviewed = true
     WHERE contract_id = $1`,
    [contractId, vendorId, from, to],
  );

  await client.query(
    `UPDATE contract
     SET vendor_id = $2, effective_from = $3::date, effective_to = NULLIF($4, '')::date,
         status = 'reviewed', reviewed_at = now()
     WHERE id = $1`,
    [contractId, vendorId, from, to],
  );
}

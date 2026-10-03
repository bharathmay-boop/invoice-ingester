import "server-only";
import { query } from "../db.ts";
import type { Coverage } from "./variance.ts";

/**
 * What the contract side says about a vendor, an item and a date.
 *
 * Three outcomes that are not the same thing, and keeping them apart is the
 * point. A vendor with no contract at all is silence. A vendor who has
 * contracts, none of which cover this date, is a finding that needs no correct
 * rate to be right. A covered item with no rate against it is a third thing
 * again.
 *
 * Only reviewed rates are visible here. That single `WHERE` is what makes
 * reading a two hundred page PDF with a cheap model safe: nothing a model read
 * can reach an invoice before a person agreed with it.
 */
export async function coverageFor(
  vendorId: string,
  itemId: string | null,
  invoiceDate: string,
): Promise<Coverage> {
  // A line that never matched a catalogue item cannot be looked up at all, and
  // has nothing said about it. Same treatment as an unmatched line everywhere
  // else.
  if (!itemId) return { kind: "no_contract" };

  const covering = await query<{
    rate: number;
    unit: string | null;
    effective_from: string;
    effective_to: string | null;
  }>(
    `SELECT rate::float, unit, effective_from, effective_to
     FROM contract_rate
     WHERE reviewed AND vendor_id = $1 AND item_id = $2
       AND effective_from <= $3::date
       AND (effective_to IS NULL OR effective_to >= $3::date)
     ORDER BY effective_from DESC
     LIMIT 1`,
    [vendorId, itemId, invoiceDate],
  );
  if (covering[0]) return { kind: "covered", rate: covering[0] };

  // Nothing priced this item on this date. Which of the two remaining answers
  // it is depends on whether anything at all covered the date.
  const [{ n: inForce }] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM contract_rate
     WHERE reviewed AND vendor_id = $1
       AND effective_from <= $2::date
       AND (effective_to IS NULL OR effective_to >= $2::date)`,
    [vendorId, invoiceDate],
  );
  if (inForce > 0) return { kind: "not_priced" };

  const [{ n: ever }] = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM contract_rate WHERE reviewed AND vendor_id = $1",
    [vendorId],
  );
  // Contracts exist for this supplier, none covering this date. Billing after
  // one lapsed is a real finding. No contracts at all is silence, or every
  // invoice from every uncontracted supplier would light up.
  return ever > 0 ? { kind: "outside_period" } : { kind: "no_contract" };
}

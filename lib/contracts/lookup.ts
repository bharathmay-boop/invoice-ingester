import "server-only";
import type { PoolClient } from "pg";
import { query as poolQuery } from "../db.ts";
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
  // A caller that already holds a connection passes it, so this never asks the
  // pool for a second one while the caller waits on the first.
  client?: Pick<PoolClient, "query">,
): Promise<Coverage> {
  const query = client
    ? async <T extends import("pg").QueryResultRow>(sql: string, params?: unknown[]) =>
        (await client.query<T>(sql, params)).rows
    : poolQuery;
  // A line that never matched a catalogue item cannot be looked up at all, and
  // has nothing said about it. Same treatment as an unmatched line everywhere
  // else.
  if (!itemId) return { kind: "no_contract" };

  const covering = await query<{
    rate: number;
    unit: string | null;
    currency: string;
    effective_from: string;
    effective_to: string | null;
  }>(
    // Currency comes with the rate, not as an afterthought: the comparison
    // refuses a pair in two currencies, and it can only refuse what it is told.
    `SELECT rate::float, unit, currency, effective_from, effective_to
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
  //
  // "Anything" includes a reviewed contract's own period, not only its rates.
  // A contract with no rate card is ordinary, and it still covers its dates:
  // an item it never prices is `not_priced`, where reading rates alone made it
  // indistinguishable from no contract at all (#118).
  const [{ n: inForce }] = await query<{ n: number }>(
    `SELECT (SELECT count(*) FROM contract_rate
             WHERE reviewed AND vendor_id = $1
               AND effective_from <= $2::date
               AND (effective_to IS NULL OR effective_to >= $2::date))
          + (SELECT count(*) FROM contract
             WHERE status = 'reviewed' AND vendor_id = $1
               AND effective_from <= $2::date
               AND (effective_to IS NULL OR effective_to >= $2::date)) AS n`,
    [vendorId, invoiceDate],
  );
  if (Number(inForce) > 0) return { kind: "not_priced" };

  // A reviewed contract's own period only counts once it is known. One reviewed
  // before the period was stored has none, and is covered by its rates alone as
  // it always was. A legacy contract with no rates has neither, and counting it
  // would light up every invoice from that supplier as outside its period.
  const [{ n: ever }] = await query<{ n: number }>(
    `SELECT (SELECT count(*) FROM contract_rate WHERE reviewed AND vendor_id = $1)
          + (SELECT count(*) FROM contract
             WHERE status = 'reviewed' AND vendor_id = $1 AND effective_from IS NOT NULL) AS n`,
    [vendorId],
  );
  // Contracts exist for this supplier, none covering this date. Billing after
  // one lapsed is a real finding. No contracts at all is silence, or every
  // invoice from every uncontracted supplier would light up.
  return Number(ever) > 0 ? { kind: "outside_period" } : { kind: "no_contract" };
}

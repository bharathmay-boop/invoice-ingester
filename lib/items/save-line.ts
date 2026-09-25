import "server-only";
import type pg from "pg";
import { normalize } from "./normalize.ts";
import { findMatch, type Thresholds } from "./match.ts";

/** The parts of a line the catalogue cares about. */
export type SavableLine = {
  description: string;
  hsn_code: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  amount: number;
};

export type SavedLine = {
  lineItemId: string;
  itemId: string | null;
  /** Null unless a person or a score linked it. */
  confidence: number | null;
  suggested: boolean;
};

/**
 * One line item, matched and written.
 *
 * Three outcomes, and only two of them touch the catalogue. A clear match
 * links. Nothing close enough becomes a new item. The band between leaves the
 * line unlinked with the candidate recorded, because guessing either way is
 * exactly what the band exists to avoid: link and two products merge, create
 * and one product's history splits in two.
 *
 * Runs inside the caller's transaction, so a line, its item and its suggestion
 * are all written together or not at all.
 */
export async function saveLine(
  client: pg.PoolClient,
  invoiceId: string,
  line: SavableLine,
  thresholds: Thresholds,
): Promise<SavedLine> {
  const key = normalize(line.description);
  const match = await findMatch(client, key, thresholds);

  const itemId =
    match.kind === "linked"
      ? match.itemId
      : match.kind === "new"
        ? (
            await client.query<{ id: string }>(
              "INSERT INTO item (canonical_name, normalized_name) VALUES ($1,$2) RETURNING id",
              [line.description, key],
            )
          ).rows[0].id
        : null;

  const confidence = match.kind === "linked" ? match.score : null;

  const [savedLine] = (
    await client.query<{ id: string }>(
      `INSERT INTO line_item (invoice_id, raw_description, hsn_code, quantity, unit,
                              unit_price, amount, item_id, match_confidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        invoiceId,
        line.description,
        line.hsn_code,
        line.quantity,
        line.unit,
        line.unit_price,
        line.amount,
        itemId,
        confidence,
      ],
    )
  ).rows;

  if (match.kind === "suggested") {
    await client.query(
      "INSERT INTO match_suggestion (line_item_id, item_id, score) VALUES ($1,$2,$3)",
      [savedLine.id, match.itemId, match.score],
    );
  }

  return {
    lineItemId: savedLine.id,
    itemId,
    confidence,
    suggested: match.kind === "suggested",
  };
}

import "server-only";
import type pg from "pg";
import { normalize } from "./normalize.ts";
import { findMatch, type Thresholds } from "./match.ts";

/** The parts of a line the catalogue cares about. */
export type SavableLine = {
  description: string;
  item_code: string | null;
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
 * Serialise the saves that would create the same item.
 *
 * `item.normalized_name` is not unique, so two invoices saved together, each
 * with a line nothing resembles, would both find nothing and both insert (#223).
 * A transaction-scoped lock on the name, taken before the lookup and held to
 * commit, makes the second save wait and then find the first one's item. The key
 * is the one the contract path uses, so the two paths exclude each other too.
 *
 * A caller saving several lines takes them all first, through here, in one
 * sorted order: taken one by one as lines are saved, two invoices holding the
 * same pair of names in opposite order would each wait on the other.
 */
export async function lockItemNames(client: pg.PoolClient, descriptions: string[]) {
  const keys = [...new Set(descriptions.map(normalize))].sort();
  for (const key of keys) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`item:${key}`]);
  }
}

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
  // The demo seed runs the real matcher, and an item it has to create must be
  // labelled as demo, or it would be left behind on the next seed and look like
  // somebody's own catalogue entry.
  options: { demo?: boolean } = {},
): Promise<SavedLine> {
  const key = normalize(line.description);
  // Already held when the caller used lockItemNames, and the same session can
  // take its own lock again, so this only matters to callers that did not.
  await lockItemNames(client, [line.description]);
  const match = await findMatch(client, key, thresholds);

  const itemId =
    match.kind === "linked"
      ? match.itemId
      : match.kind === "new"
        ? (
            await client.query<{ id: string }>(
              options.demo
                ? "INSERT INTO item (canonical_name, normalized_name, is_demo) VALUES ($1,$2,true) RETURNING id"
                : "INSERT INTO item (canonical_name, normalized_name) VALUES ($1,$2) RETURNING id",
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
        // The extraction contract calls this a generic item code because the
        // line may not be Indian. The existing database column keeps its old
        // name until a later migration can replace it without breaking the
        // deployed build.
        line.item_code,
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

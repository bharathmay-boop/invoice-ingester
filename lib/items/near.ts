import "server-only";
import { normalize } from "./normalize.ts";

export type NearMiss = { itemId: string; name: string; score: number };

/** Anything with a `query`: the pool for a page, or a client inside a transaction. */
type Queryable = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

/**
 * The catalogue items a printed name might already be, best first.
 *
 * The matcher leaves a rate unmatched when it scores below the link
 * threshold, which is not the same as the catalogue lacking the thing: "Blue
 * Ballpoint Pen" against "Ballpoint Pen Blue (Pack of 10)" is one item. Making
 * a new item per contract read splits the catalogue into near duplicates and
 * spend across them, so these are offered before a new item is ever made.
 *
 * Anything at or above the suggest threshold counts. An item's own name and its
 * aliases are searched together, the best score per item, as the matcher does.
 */
export async function nearMisses(
  db: Queryable,
  printedName: string,
  // Passed in rather than read here: a caller inside a transaction holds a
  // connection, and reading the setting would ask the pool for a second one.
  suggest: number,
  limit = 3,
): Promise<NearMiss[]> {
  const key = normalize(printedName);
  if (!key) return [];

  const { rows } = await db.query(
    `WITH names AS (
       SELECT id, canonical_name, normalized_name FROM item
       UNION ALL
       SELECT a.item_id, i.canonical_name, a.normalized_name
       FROM item_alias a JOIN item i ON i.id = a.item_id
     )
     SELECT id, max(canonical_name) AS name,
            max(similarity(normalized_name, $1))::float AS score
     FROM names
     WHERE similarity(normalized_name, $1) >= $2
     GROUP BY id
     ORDER BY score DESC, name
     LIMIT $3`,
    [key, suggest, limit],
  );
  return rows.map((r) => ({
    itemId: String(r.id),
    name: String(r.name),
    score: Number(r.score),
  }));
}

import "server-only";
import type pg from "pg";
import { normalize } from "./normalize.ts";

export type NearMiss = { itemId: string; name: string; score: number };

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
 *
 * Runs on a client inside a transaction, like `findMatch`: the `%` operator is
 * what the trigram index answers, and it compares against a setting that is
 * only reliable on the connection that set it. A bare `similarity() >= x` would
 * score every item and alias.
 */
export async function nearMisses(
  client: Pick<pg.PoolClient, "query">,
  printedName: string,
  // Passed in rather than read here: a caller inside a transaction holds a
  // connection, and reading the setting would ask the pool for a second one.
  suggest: number,
  limit = 3,
): Promise<NearMiss[]> {
  const key = normalize(printedName);
  if (!key) return [];

  await client.query("SELECT set_config('pg_trgm.similarity_threshold', $1, true)", [
    String(suggest),
  ]);
  const { rows } = await client.query<{ id: string; name: string; score: number }>(
    `WITH names AS (
       SELECT id, canonical_name, normalized_name FROM item
       UNION ALL
       SELECT a.item_id, i.canonical_name, a.normalized_name
       FROM item_alias a JOIN item i ON i.id = a.item_id
     )
     SELECT id, max(canonical_name) AS name,
            max(similarity(normalized_name, $1))::float AS score
     FROM names
     WHERE normalized_name % $1
     GROUP BY id
     ORDER BY score DESC, name
     LIMIT $2`,
    [key, limit],
  );
  return rows.map((r) => ({ itemId: r.id, name: r.name, score: Number(r.score) }));
}

/**
 * Near misses for several names on one connection, for a page that is not
 * already inside a transaction. One client for all of them, so a contract with
 * forty unmatched rates takes one connection, not forty.
 */
export async function nearMissesFor(
  pool: pg.Pool,
  printedNames: string[],
  suggest: number,
): Promise<Map<string, NearMiss[]>> {
  const found = new Map<string, NearMiss[]>();
  if (!printedNames.length) return found;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const name of printedNames) found.set(name, await nearMisses(client, name, suggest));
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  return found;
}

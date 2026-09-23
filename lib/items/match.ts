import "server-only";
import type pg from "pg";
import { getSetting } from "../settings/store.ts";

/**
 * Matching a line item to the catalogue, the thing every spend figure depends
 * on. "Stapler HD-45" and "Stapler HD45" are one product, and treating them as
 * two splits the price history this product exists to show.
 *
 * Trigram similarity in Postgres rather than in JavaScript: the GIN index is
 * the only reason this stays fast as the catalogue grows, and a comparison
 * done in the database is one round trip instead of reading every item.
 */

export const DEFAULT_LINK = 0.85;
export const DEFAULT_SUGGEST = 0.6;

export type Thresholds = { link: number; suggest: number };

export type Match =
  | { kind: "linked"; itemId: string; score: number }
  | { kind: "suggested"; itemId: string; score: number }
  | { kind: "new" };

/**
 * Thresholds live in settings because the right values depend on how varied
 * the real invoices turn out to be, which nobody knows before there is data.
 */
export const THRESHOLDS_SETTING = "matching";

export async function getThresholds(): Promise<Thresholds> {
  // One row holding both, not one row each. They are only valid in relation to
  // each other, and two writes can be interrupted between them, leaving a pair
  // in the database that no request ever validated and that every later read
  // then refuses.
  const saved = await getSetting<Thresholds>(THRESHOLDS_SETTING);
  return checkThresholds({
    link: saved?.link ?? DEFAULT_LINK,
    suggest: saved?.suggest ?? DEFAULT_SUGGEST,
  });
}

/**
 * A suggest threshold above the link threshold would mean a band that links
 * and suggests at once, so it is refused rather than interpreted.
 */
export function checkThresholds(thresholds: Thresholds): Thresholds {
  const { link, suggest } = thresholds;
  for (const [name, value] of [["link", link], ["suggest", suggest]] as const) {
    if (!Number.isFinite(value) || value <= 0 || value > 1) {
      throw new Error(`the ${name} threshold must be above 0 and at most 1`);
    }
  }
  if (suggest > link) {
    throw new Error("the suggest threshold cannot be above the link threshold");
  }
  return thresholds;
}

/**
 * What a score means. At exactly the link threshold it links: the threshold is
 * the score you are willing to accept, not the first score you refuse. The
 * same reading applies at the suggest threshold.
 */
export function decide(
  score: number | null,
  itemId: string | null,
  { link, suggest }: Thresholds,
): Match {
  if (score === null || itemId === null || score < suggest) return { kind: "new" };
  return score >= link
    ? { kind: "linked", itemId, score }
    : { kind: "suggested", itemId, score };
}

/**
 * The closest catalogue item to a normalised description, and what to do with
 * it. Runs inside the caller's transaction, since the save decides and writes
 * in one go.
 */
export async function findMatch(
  client: pg.PoolClient,
  normalizedName: string,
  thresholds: Thresholds,
): Promise<Match> {
  // The `%` operator is what the GIN index answers, and it compares against
  // this setting. Set to the lowest score worth hearing about, so the index
  // does the filtering rather than a scan scoring every item.
  // set_config rather than SET LOCAL, which takes no bound parameters. The
  // third argument is the LOCAL part: it lasts until the transaction ends.
  await client.query("SELECT set_config('pg_trgm.similarity_threshold', $1, true)", [
    String(thresholds.suggest),
  ]);

  const { rows } = await client.query<{ id: string; score: number }>(
    `SELECT id, similarity(normalized_name, $1)::float AS score
     FROM item
     WHERE normalized_name % $1 OR normalized_name = $1
     ORDER BY normalized_name = $1 DESC, score DESC, created_at
     LIMIT 1`,
    [normalizedName],
  );

  const best = rows[0];
  if (!best) return { kind: "new" };
  // An exact match after normalisation is the same thing by definition, and
  // scores 1 anyway; ordering it first only saves trusting the float.
  const score = best.score;
  return decide(score, best.id, thresholds);
}

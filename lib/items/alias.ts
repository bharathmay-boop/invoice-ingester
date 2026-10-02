import "server-only";
import { query } from "../db.ts";
import { normalize } from "./normalize.ts";

/**
 * Names a person has taught the matcher, for the products whose names will
 * never score well against each other. Everything here is one sentence long on
 * purpose: an alias is a fact somebody stated, not a thing to interpret.
 */

export type Alias = { id: string; alias: string; normalized_name: string };

export type AddResult =
  | { ok: true }
  | { ok: false; message: string };

export async function listAliases(itemId: string): Promise<Alias[]> {
  return query<Alias>(
    "SELECT id, alias, normalized_name FROM item_alias WHERE item_id = $1 ORDER BY alias",
    [itemId],
  ).then((rows) => rows);
}

/**
 * Teach the matcher that a name means this item.
 *
 * Refused rather than merged when the name already belongs to something else:
 * one alias cannot mean two products, and the point of an alias is to remove a
 * guess rather than add one. The message names the other item, because "that
 * is taken" without saying by what leaves nothing to do about it.
 *
 * Refused too when it normalises to the same thing as the item's own name,
 * which teaches nothing and would sit on the screen looking like it had.
 */
export async function addAlias(itemId: string, alias: string): Promise<AddResult> {
  const trimmed = alias.trim();
  if (!trimmed) return { ok: false, message: "Type the name you want matched." };

  const normalized = normalize(trimmed);
  if (!normalized) {
    return { ok: false, message: "That is all punctuation, so there is nothing to match on." };
  }

  const own = await query<{ canonical_name: string }>(
    "SELECT canonical_name FROM item WHERE id = $1 AND normalized_name = $2",
    [itemId, normalized],
  );
  if (own.length) {
    return { ok: false, message: `This item is already called that, so the matcher finds it already.` };
  }

  const taken = await query<{ canonical_name: string }>(
    `SELECT i.canonical_name
     FROM item_alias a JOIN item i ON i.id = a.item_id
     WHERE a.normalized_name = $1`,
    [normalized],
  );
  if (taken.length) {
    return {
      ok: false,
      message: `"${trimmed}" already means ${taken[0].canonical_name}. One name cannot mean two products.`,
    };
  }

  const clash = await query<{ canonical_name: string }>(
    "SELECT canonical_name FROM item WHERE normalized_name = $1",
    [normalized],
  );
  if (clash.length) {
    return {
      ok: false,
      message: `There is already an item called ${clash[0].canonical_name}. Merge the two rather than aliasing one to the other.`,
    };
  }

  await query(
    "INSERT INTO item_alias (item_id, alias, normalized_name) VALUES ($1, $2, $3)",
    [itemId, trimmed, normalized],
  );
  return { ok: true };
}

export async function removeAlias(itemId: string, aliasId: string): Promise<void> {
  // Scoped to the item so a stale form on one screen cannot delete another
  // item's alias by id.
  await query("DELETE FROM item_alias WHERE id = $1 AND item_id = $2", [aliasId, itemId]);
}

import "server-only";
import { pool } from "../db.ts";

export type Merged = {
  keptId: string;
  /** How many purchases moved across, for a message that says what happened. */
  moved: number;
  suggestionsMoved: number;
};

export type MergeFailure =
  | { ok: false; reason: "same_item" }
  | { ok: false; reason: "not_found" };

export type MergeResult = ({ ok: true } & Merged) | MergeFailure;

/**
 * Folds one catalogue item into another: every line item moves across, and the
 * emptied item goes.
 *
 * This is the undo for a wrong automatic link, which is what makes automatic
 * linking safe to offer at all. Without it, one bad match is permanent and
 * every threshold has to be set defensively.
 *
 * All of it in one transaction. A half done merge leaves purchases pointing at
 * an item that no longer exists, or a catalogue entry nobody can reach, and
 * both are spend figures that quietly stop adding up.
 */
export async function mergeItems(keepId: string, mergeId: string): Promise<MergeResult> {
  if (keepId === mergeId) return { ok: false, reason: "same_item" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Locked in a fixed order, smallest id first, so two merges naming the
    // same pair from opposite sides cannot each hold what the other needs.
    const [first, second] = [keepId, mergeId].sort();
    const locked = await client.query<{ id: string }>(
      "SELECT id FROM item WHERE id IN ($1, $2) ORDER BY id FOR UPDATE",
      [first, second],
    );
    if (locked.rows.length !== 2) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "not_found" };
    }

    const moved = await client.query(
      "UPDATE line_item SET item_id = $1 WHERE item_id = $2",
      [keepId, mergeId],
    );

    // Suggestions pointing at the item that is going would otherwise be
    // deleted with it, taking an unanswered question with them.
    //
    // No collision to guard against: line_item_id is the primary key, so a
    // line holds one suggestion at most and there is never a second row for
    // the same line to clash with.
    const suggestions = await client.query(
      "UPDATE match_suggestion SET item_id = $1 WHERE item_id = $2",
      [keepId, mergeId],
    );

    await client.query("DELETE FROM item WHERE id = $1", [mergeId]);
    await client.query("COMMIT");

    return {
      ok: true,
      keptId: keepId,
      moved: moved.rowCount ?? 0,
      suggestionsMoved: suggestions.rowCount ?? 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

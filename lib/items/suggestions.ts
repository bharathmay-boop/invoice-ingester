import "server-only";
import { pool } from "../db.ts";

export type Verdict = "accepted" | "rejected";

export type Applied =
  | { ok: true; verdict: Verdict }
  /** Already answered, by another tab or another person. */
  | { ok: false; reason: "already_decided" };

/**
 * Records one decision, and links the line when the answer is yes.
 *
 * Both in one transaction: a price history that shows a purchase whose
 * decision was never saved, or a decision saved against a line that was never
 * linked, are both wrong in a way nothing downstream would announce.
 */
export async function applyDecision(lineItemId: string, verdict: Verdict): Promise<Applied> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // The update is the claim: `decision IS NULL` means only the first caller
    // gets the row, so two tabs cannot both decide the same suggestion.
    const claimed = await client.query<{ item_id: string; score: string }>(
      `UPDATE match_suggestion
       SET decision = $2, decided_at = now()
       WHERE line_item_id = $1 AND decision IS NULL
       RETURNING item_id, score`,
      [lineItemId, verdict],
    );
    if (!claimed.rows.length) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "already_decided" };
    }

    if (verdict === "accepted") {
      const { item_id, score } = claimed.rows[0];
      await client.query(
        "UPDATE line_item SET item_id = $2, match_confidence = $3 WHERE id = $1",
        [lineItemId, item_id, score],
      );
    }

    await client.query("COMMIT");
    return { ok: true, verdict };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

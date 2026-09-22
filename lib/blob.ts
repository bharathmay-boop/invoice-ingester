import "server-only";
import { del } from "@vercel/blob";
import { pool, query } from "./db.ts";

/**
 * Removes a stored original and whatever was tracking it.
 *
 * Deleting only the database row would leave the file in the blob store
 * forever: paid for, unreachable through the app, and still somebody's
 * invoice. A failed delete is not worth failing the user's action over, so it
 * is logged and swallowed.
 */
export async function discardUpload(url: string): Promise<void> {
  // Neither half may throw. This is best effort cleanup, and it is called from
  // error handlers: a failure here would replace the real error with this one,
  // so the caller would lose both the reason and its structured response.
  try {
    await del(url);
  } catch (error) {
    console.error("could not delete blob", url, error instanceof Error ? error.message : error);
  }

  try {
    await query("DELETE FROM upload WHERE blob_url = $1", [url]);
  } catch (error) {
    console.error(
      "could not delete upload row",
      url,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Removes one draft, and its original only if nothing else still uses it.
 *
 * Several drafts can share one original, one per invoice in a multi invoice
 * PDF, and a confirmed one hands it to its saved invoice. Deleting the file
 * with the first discard would pull it out from under the rest.
 *
 * The advisory lock is what makes "am I the last?" answerable. Without it two
 * siblings discarded at once each see the other still there, both keep the
 * file, and it is stranded with nothing pointing at it. With it the second
 * waits until the first has committed, then sees it gone.
 *
 * A confirm needs no lock: it swaps its draft for an invoice in one
 * transaction, so a discard sees one or the other and keeps the file.
 *
 * Returns false when the draft was already gone, confirmed or discarded by
 * someone else, in which case nothing is deleted.
 */
export async function releaseDraft(draftId: string): Promise<boolean> {
  const client = await pool.connect();
  let orphaned: string | null = null;
  try {
    await client.query("BEGIN");
    // The delete is the claim. Only the caller that removed the draft decides
    // anything about the file.
    const gone = await client.query<{ blob_url: string }>(
      "DELETE FROM draft WHERE id = $1 RETURNING blob_url",
      [draftId],
    );
    if (!gone.rows.length) {
      await client.query("ROLLBACK");
      return false;
    }
    const url = gone.rows[0].blob_url;

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [url]);
    const users = await client.query(
      `SELECT 1 FROM draft WHERE blob_url = $1
       UNION ALL
       SELECT 1 FROM invoice WHERE blob_url = $1
       LIMIT 1`,
      [url],
    );
    await client.query("COMMIT");
    if (!users.rows.length) orphaned = url;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // After the commit: the rows are settled, and a failed blob delete is logged
  // by discardUpload rather than undoing a discard that did happen.
  if (orphaned) await discardUpload(orphaned);
  return true;
}

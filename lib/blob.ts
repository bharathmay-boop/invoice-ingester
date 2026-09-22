import "server-only";
import { del } from "@vercel/blob";
import { query } from "./db.ts";

/**
 * Removes a stored original and whatever was tracking it.
 *
 * Deleting only the database row would leave the file in the blob store
 * forever: paid for, unreachable through the app, and still somebody's
 * invoice. A failed delete is not worth failing the user's action over, so it
 * is logged and swallowed.
 */
export async function discardUpload(url: string): Promise<void> {
  try {
    await del(url);
  } catch (error) {
    console.error("could not delete blob", url, error instanceof Error ? error.message : error);
  }
  await query("DELETE FROM upload WHERE blob_url = $1", [url]);
}

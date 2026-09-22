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

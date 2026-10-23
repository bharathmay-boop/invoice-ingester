/**
 * Saying that a save happened. The review screen redirects after saving, and
 * the place it lands on is told which invoice was saved so it can say so
 * (#247).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where to go after a save: the next draft from the same file, or vendors. */
export function afterSave(nextDraftId: string | null, savedId: string): string {
  const saved = `saved=${encodeURIComponent(savedId)}`;
  return nextDraftId ? `/review/${nextDraftId}?${saved}` : `/vendors?${saved}`;
}

/** The saved invoice's id from a search param, or null for anything else. */
export function savedFrom(param: string | string[] | undefined): string | null {
  return typeof param === "string" && UUID.test(param) ? param : null;
}

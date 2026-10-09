import type pg from "pg";
import { normalizeAddress, normalizeName } from "./normalize.ts";

/**
 * Recompute the name and address keys on every vendor row (#217).
 *
 * Rows saved before the fix carry keys built by the item normaliser, so the
 * next invoice from the same supplier would compute a different key, miss the
 * stored one, and create a second row. Run once, straight after the code that
 * writes the new keys is live. Safe to run twice: it only writes rows whose
 * key is out of date.
 *
 * It cannot split rows that were already merged. Two suppliers that shared a
 * key are one row, one id, and their invoices all point at it; nothing stored
 * says which invoice came from which, so there is no way to detect or undo
 * that here. A supplier whose invoices look like two companies has to be
 * looked at by a person.
 *
 * Every key is a pure function of the stored name and address, and the new
 * key is finer than the old one, so two rows that were distinct stay distinct.
 * A row can be blocked only until the row holding its new key has moved, so
 * blocked rows are retried until a pass changes nothing. What is still blocked
 * then is reported and left alone rather than aborting the run.
 */
export async function rekeyVendors(
  client: Pick<pg.PoolClient, "query">,
): Promise<{ updated: number; collisions: string[] }> {
  const { rows } = await client.query<{
    id: string;
    name: string;
    address: string | null;
    normalized_name: string;
    normalized_address: string;
  }>("SELECT id, name, address, normalized_name, normalized_address FROM vendor ORDER BY name");

  // A row can be blocked only because the row holding its new key has not moved
  // yet, so blocked rows are retried until a whole pass changes nothing. Only
  // what is still blocked then is a real collision.
  let pending = rows.filter((row) => {
    return (
      normalizeName(row.name) !== row.normalized_name ||
      normalizeAddress(row.address ?? "") !== row.normalized_address
    );
  });
  let updated = 0;
  for (;;) {
    const blocked: typeof pending = [];
    for (const row of pending) {
      await client.query("SAVEPOINT rekey");
      try {
        await client.query(
          "UPDATE vendor SET normalized_name = $2, normalized_address = $3 WHERE id = $1",
          [row.id, normalizeName(row.name), normalizeAddress(row.address ?? "")],
        );
        await client.query("RELEASE SAVEPOINT rekey");
        updated++;
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT rekey");
        if (!(error instanceof Error && "code" in error && error.code === "23505")) throw error;
        blocked.push(row);
      }
    }
    const progressed = blocked.length < pending.length;
    pending = blocked;
    if (!pending.length || !progressed) break;
  }
  const collisions = pending.map((row) => `${row.id}: ${row.name}`);
  return { updated, collisions };
}

import "server-only";
import { query } from "../db.ts";

/**
 * Whether everything a screen could show is still the seeded demo: no
 * confirmed invoice that is not marked is_demo. The in-app notice follows
 * this, so it disappears the day a real invoice is saved instead of going on
 * describing real data as made up (#158).
 */
export async function onlyDemoData(): Promise<boolean> {
  const [row] = await query<{ real: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM invoice WHERE NOT is_demo AND status = 'confirmed') AS real",
  );
  return !row?.real;
}

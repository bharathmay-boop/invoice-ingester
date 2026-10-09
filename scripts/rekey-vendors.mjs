// Recompute vendor name and address keys after #217. One off, safe to run
// twice. Run it straight after the code that writes the new keys is live:
// until then, an invoice from a supplier saved before the fix misses the
// stored key and creates a second row for the same supplier.
import pg from "pg";
import { verifyFull } from "../lib/db-url.ts";

const { rekeyVendors } = await import("../lib/vendors/rekey.ts");

const client = new pg.Client({
  connectionString: verifyFull(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL),
});
await client.connect();
try {
  await client.query("BEGIN");
  const { updated, collisions } = await rekeyVendors(client);
  await client.query("COMMIT");
  console.log(`${updated} vendor key(s) updated`);
  if (collisions.length) {
    console.log(`${collisions.length} left alone, the new key already belongs to another row:`);
    for (const line of collisions) console.log(`  ${line}`);
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

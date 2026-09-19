// Applies db/migrations/*.sql in filename order, once each, inside a transaction.
// ponytail: a 40 line runner instead of a migration framework. Swap it out when
// rollbacks or branch-per-migration become a real need.
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = fileURLToPath(new URL("../db/migrations/", import.meta.url));
// Unpooled by preference: DDL in a transaction does not sit well behind
// pgbouncer. Neon sets both, so this only falls back on a plain Postgres URL.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `vercel env pull` first.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(
  `CREATE TABLE IF NOT EXISTS _migration (
     name text PRIMARY KEY,
     applied_at timestamptz NOT NULL DEFAULT now()
   )`,
);

const { rows } = await client.query("SELECT name FROM _migration");
const done = new Set(rows.map((r) => r.name));
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

let applied = 0;
for (const file of files) {
  if (done.has(file)) continue;
  const sql = await readFile(dir + file, "utf8");
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO _migration (name) VALUES ($1)", [file]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`${file} failed, nothing was applied:`, err.message);
    await client.end();
    process.exit(1);
  }
  console.log(`applied ${file}`);
  applied += 1;
}

console.log(applied ? `${applied} migration(s) applied` : "already up to date");
await client.end();

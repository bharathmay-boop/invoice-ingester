import pg from "pg";

// ponytail: one pool, the pooled Neon URL, no ORM. Queries in this app are
// hand written SQL because the interesting one is a trigram match, which an
// ORM would only get in the way of.
const globalForPool = globalThis as unknown as { pool?: pg.Pool };

export const pool =
  globalForPool.pool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    // Set at connection setup rather than by a query afterwards. Tests use this
    // to work in a throwaway schema, and doing it with a `SET` on the pool's
    // connect event is a race: the pool can hand the client out and run a query
    // on it before that SET has finished, which silently puts the write in
    // public instead.
    options: process.env.DATABASE_SCHEMA
      ? `-c search_path=${process.env.DATABASE_SCHEMA},public`
      : undefined,
  });

// Next reloads modules in development; without this every reload leaks a pool.
if (process.env.NODE_ENV !== "production") globalForPool.pool = pool;

export async function query<T extends pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

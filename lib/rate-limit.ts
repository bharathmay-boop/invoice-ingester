import "server-only";
import { createHmac } from "node:crypto";
import { pool, query } from "./db.ts";

/**
 * The password gate is one password against the open internet. Without this
 * there is no lockout, no delay, and no record that anyone tried.
 *
 * ponytail: a row per attempt in Postgres, which is already here. Not a token
 * bucket and not a separate store. Upgrade path is the Vercel firewall if the
 * write volume ever matters, which at one row per login attempt it will not.
 */
const WINDOW_MINUTES = 15;
const MAX_FAILURES = 8;
/** Rows older than this are noise; swept on every attempt. */
const RETENTION_MINUTES = WINDOW_MINUTES * 4;

const LABEL = "invoice-ingester/login-source/v1";

/**
 * Keyed, not a bare digest.
 *
 * An unkeyed SHA-256 of an IP is not a privacy boundary: IPv4 is 2^32 values,
 * so anyone holding the table can hash every address and read straight back
 * which ones tried to log in. Keying it with a secret they do not have is what
 * makes the pseudonym one, and it is derived from the master key so there is no
 * second secret to manage.
 */
function fingerprint(request: Request): string {
  const master = process.env.SETTINGS_MASTER_KEY;
  if (!master) throw new Error("SETTINGS_MASTER_KEY is not set");

  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";

  return createHmac("sha256", Buffer.from(master, "base64"))
    .update(`${LABEL}:${ip}`)
    .digest("base64url")
    .slice(0, 32);
}

export type Limit = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Records this attempt and says whether it is allowed, in one transaction under
 * a per source advisory lock.
 *
 * Counting and recording as two separate statements let a parallel burst all
 * read a low count, all pass, and only then record, so eight guesses became as
 * many as arrived at once. The lock serialises attempts from one source without
 * touching any other source.
 */
export async function registerLoginAttempt(request: Request): Promise<Limit> {
  const source = fingerprint(request);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    // Serialises this source only. hashtext gives the lock an integer key.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [source]);

    // Swept here rather than after a successful login: an installation that
    // only ever receives failures would otherwise keep every row forever.
    await client.query(
      `DELETE FROM login_attempt WHERE at < now() - ($1 || ' minutes')::interval`,
      [String(RETENTION_MINUTES)],
    );

    const { rows } = await client.query<{ failures: number; oldest: string | null }>(
      `SELECT count(*)::int AS failures, min(at)::text AS oldest
       FROM login_attempt
       WHERE source = $1 AND at > now() - ($2 || ' minutes')::interval`,
      [source, String(WINDOW_MINUTES)],
    );

    const failures = rows[0]?.failures ?? 0;
    if (failures >= MAX_FAILURES) {
      const oldest = rows[0]?.oldest ? new Date(rows[0].oldest).getTime() : Date.now();
      const freeAt = oldest + WINDOW_MINUTES * 60_000;
      await client.query("COMMIT");
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((freeAt - Date.now()) / 1000)),
      };
    }

    // The slot is taken before the password is checked, so concurrent requests
    // cannot all be admitted on the same count. A correct password clears it.
    await client.query("INSERT INTO login_attempt (source) VALUES ($1)", [source]);
    await client.query("COMMIT");
    return { allowed: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** A correct password clears the record, so one fat-fingered evening is not a lockout. */
export async function clearLoginAttempts(request: Request): Promise<void> {
  await query("DELETE FROM login_attempt WHERE source = $1", [fingerprint(request)]);
}

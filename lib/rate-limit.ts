import "server-only";
import { createHash } from "node:crypto";
import { query } from "./db.ts";

/**
 * The password gate is one password against the open internet. Without this
 * there is no lockout, no delay, and no record that anyone tried.
 *
 * ponytail: a row per failure in Postgres, which is already here. Not a token
 * bucket and not a separate store. Upgrade path is the Vercel firewall if the
 * write volume ever matters, which at one row per wrong password it will not.
 */
const WINDOW_MINUTES = 15;
const MAX_FAILURES = 8;

/**
 * Addresses are hashed before storage. Knowing that a source is guessing does
 * not require keeping a log of who visited, and an unsalted list of visitor IPs
 * is a liability rather than an asset.
 */
function fingerprint(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(ip).digest("base64url").slice(0, 32);
}

export type Limit = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export async function checkLoginRate(request: Request): Promise<Limit> {
  const source = fingerprint(request);

  const rows = await query<{ failures: number; oldest: string }>(
    `SELECT count(*)::int AS failures, min(at)::text AS oldest
     FROM login_attempt
     WHERE source = $1 AND at > now() - ($2 || ' minutes')::interval`,
    [source, String(WINDOW_MINUTES)],
  );

  const failures = rows[0]?.failures ?? 0;
  if (failures < MAX_FAILURES) return { allowed: true };

  // Locked until the oldest failure in the window ages out, so the window
  // slides rather than resetting everyone at a fixed boundary.
  const oldest = rows[0]?.oldest ? new Date(rows[0].oldest).getTime() : Date.now();
  const freeAt = oldest + WINDOW_MINUTES * 60_000;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((freeAt - Date.now()) / 1000)),
  };
}

export async function recordLoginFailure(request: Request): Promise<void> {
  await query("INSERT INTO login_attempt (source) VALUES ($1)", [fingerprint(request)]);
}

/** A correct password clears the record, so one fat-fingered evening is not a lockout. */
export async function clearLoginFailures(request: Request): Promise<void> {
  await query("DELETE FROM login_attempt WHERE source = $1", [fingerprint(request)]);
}

/** Old rows are noise. Swept on success rather than by a scheduled job. */
export async function sweepLoginAttempts(): Promise<void> {
  await query(
    `DELETE FROM login_attempt WHERE at < now() - ($1 || ' minutes')::interval`,
    [String(WINDOW_MINUTES * 4)],
  );
}

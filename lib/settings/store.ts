// Reading and writing settings. Everything that can return a plaintext key
// lives here and nowhere else.
import "server-only";
import { query } from "../db.ts";
import { maskKey, seal, unseal } from "./crypto.ts";

export type SecretName = "anthropic_api_key" | "openrouter_api_key";

export type SecretStatus = { present: boolean; masked: string | null };

/**
 * Local only escape hatch for testing a key without saving it.
 *
 * The database is shared with the deployed app, so a key saved through settings
 * is a key the deployed app can spend. A key put in .env.local instead never
 * leaves this machine: the fallback is switched off whenever VERCEL is set,
 * which it always is on a deployment and never is locally.
 */
const ENV_FALLBACK: Record<SecretName, string> = {
  anthropic_api_key: "ANTHROPIC_API_KEY",
  openrouter_api_key: "OPENROUTER_API_KEY",
};

function localKey(name: SecretName): string | null {
  if (process.env.VERCEL) return null;
  const value = process.env[ENV_FALLBACK[name]]?.trim();
  return value ? value : null;
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const rows = await query<{ value: T }>(
    "SELECT value FROM setting WHERE key = $1",
    [key],
  );
  return rows.length ? rows[0].value : null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await query(
    `INSERT INTO setting (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export async function setSecret(
  name: SecretName,
  plaintext: string,
): Promise<void> {
  const trimmed = plaintext.trim();
  if (!trimmed) throw new Error("refusing to store an empty key");
  await query(
    `INSERT INTO secret (name, sealed, last_four) VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE
       SET sealed = $2, last_four = $3, updated_at = now()`,
    [name, seal(name, trimmed), maskKey(trimmed)],
  );
}

/**
 * The only way to get a key back. Server side callers only, and the result is
 * never part of a response body.
 */
export async function getSecret(name: SecretName): Promise<string | null> {
  const rows = await query<{ sealed: string }>(
    "SELECT sealed FROM secret WHERE name = $1",
    [name],
  );
  // A saved key wins, so the environment cannot quietly shadow one somebody
  // entered on purpose.
  if (rows.length) return unseal(name, rows[0].sealed);
  return localKey(name);
}

/** What the settings page renders: whether a key is set, and its last four. */
export async function describeSecret(name: SecretName): Promise<SecretStatus> {
  const rows = await query<{ last_four: string }>(
    "SELECT last_four FROM secret WHERE name = $1",
    [name],
  );
  if (rows.length) return { present: true, masked: rows[0].last_four };

  // Says so plainly when the key is coming from the environment, otherwise the
  // settings page would claim no key is set while uploads quietly work.
  const local = localKey(name);
  return local
    ? { present: true, masked: `${maskKey(local)} (from .env.local)` }
    : { present: false, masked: null };
}

export async function deleteSecret(name: SecretName): Promise<void> {
  await query("DELETE FROM secret WHERE name = $1", [name]);
}

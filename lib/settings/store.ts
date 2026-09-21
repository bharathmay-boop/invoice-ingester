// Reading and writing settings. Everything that can return a plaintext key
// lives here and nowhere else.
import "server-only";
import { query } from "../db.ts";
import { maskKey, seal, unseal } from "./crypto.ts";

export type SecretName = "anthropic_api_key" | "openrouter_api_key";

export type SecretStatus = { present: boolean; masked: string | null };

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
  return rows.length ? unseal(name, rows[0].sealed) : null;
}

/** What the settings page renders: whether a key is set, and its last four. */
export async function describeSecret(name: SecretName): Promise<SecretStatus> {
  const rows = await query<{ last_four: string }>(
    "SELECT last_four FROM secret WHERE name = $1",
    [name],
  );
  return rows.length
    ? { present: true, masked: rows[0].last_four }
    : { present: false, masked: null };
}

export async function deleteSecret(name: SecretName): Promise<void> {
  await query("DELETE FROM secret WHERE name = $1", [name]);
}

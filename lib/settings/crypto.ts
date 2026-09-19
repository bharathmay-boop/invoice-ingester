// AES-256-GCM sealing for API keys. The master key lives in an environment
// variable, never in the database, so a database dump on its own is useless.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12; // 96 bits, the size GCM is specified for
const TAG_BYTES = 16; // 128 bits, the full tag
const KEY_BYTES = 32;

function masterKey(): Buffer {
  const raw = process.env.SETTINGS_MASTER_KEY;
  if (!raw) {
    throw new Error("SETTINGS_MASTER_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `SETTINGS_MASTER_KEY must be ${KEY_BYTES} bytes of base64, got ${key.length}`,
    );
  }
  return key;
}

/**
 * Seals a secret for storage. `name` is bound in as additional authenticated
 * data, so a ciphertext cannot be lifted from one setting into another: moving
 * the anthropic key row into the openrouter row fails to decrypt rather than
 * quietly succeeding.
 */
export function seal(name: string, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(name, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

/** Throws if the master key is wrong, the name does not match, or the stored form was edited. */
export function unseal(name: string, sealed: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !body) {
    throw new Error("stored value is not a sealed secret");
  }

  // GCM accepts short authentication tags, and a short tag is a weak tag: 32
  // bits of authentication instead of 128. Anyone who can write to the secret
  // table could otherwise swap a full tag for a truncated one and make forged
  // ciphertext far cheaper to land. Both lengths are fixed by seal, so any
  // other length means the stored value was tampered with.
  const ivBytes = Buffer.from(iv, "base64url");
  const tagBytes = Buffer.from(tag, "base64url");
  if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) {
    throw new Error("stored value has the wrong iv or authentication tag size");
  }

  const decipher = createDecipheriv("aes-256-gcm", masterKey(), ivBytes, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(name, "utf8"));
  decipher.setAuthTag(tagBytes);
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** What the browser is allowed to see: enough to recognise a key, not to use it. */
export function maskKey(plaintext: string): string {
  return plaintext.length <= 4 ? "****" : `****${plaintext.slice(-4)}`;
}

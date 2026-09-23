// One password gates every write. This is a cookie and a signed token, not an
// authentication system, which is all a single user app needs.
//
// Web Crypto rather than node:crypto throughout, because the same functions run
// in the proxy, which is not a Node runtime.

const LABEL = "invoice-ingester/session/v1";
const COOKIE = "session";
const TTL_SECONDS = 60 * 60 * 24 * 14;

const encoder = new TextEncoder();

/**
 * The signing key is derived from SETTINGS_MASTER_KEY with a label rather than
 * being a second environment variable. One root secret with per purpose
 * subkeys is the usual way to avoid reusing the same key for two jobs, and it
 * means rotating the master key also invalidates every session, which is the
 * behaviour you want from a rotation.
 */
async function signingKey(): Promise<CryptoKey> {
  const raw = process.env.SETTINGS_MASTER_KEY;
  if (!raw) throw new Error("SETTINGS_MASTER_KEY is not set");

  const master = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (master.length !== 32) {
    throw new Error("SETTINGS_MASTER_KEY must be 32 bytes of base64");
  }

  const root = await crypto.subtle.importKey(
    "raw",
    master,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derived = await crypto.subtle.sign("HMAC", root, encoder.encode(LABEL));
  return crypto.subtle.importKey(
    "raw",
    derived,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** `<expiry>.<signature>`. The expiry is in the signed payload, so it cannot be edited. */
export async function mintSession(now = Date.now()): Promise<string> {
  const expiry = String(Math.floor(now / 1000) + TTL_SECONDS);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    encoder.encode(expiry),
  );
  return `${expiry}.${toBase64Url(signature)}`;
}

export async function isValidSession(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;

  const separator = token.indexOf(".");
  if (separator < 1) return false;

  const expiry = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^\d+$/.test(expiry) || !signature) return false;

  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = fromBase64Url(signature);
  } catch {
    return false;
  }

  // Signature first, expiry second. Checking the expiry of an unverified token
  // would be reading a number an attacker chose.
  const verified = await crypto.subtle.verify(
    "HMAC",
    await signingKey(),
    signatureBytes,
    encoder.encode(expiry),
  );
  if (!verified) return false;

  return Number(expiry) > Math.floor(now / 1000);
}

/**
 * Compares HMACs rather than the passwords themselves, so the comparison is
 * both constant time and independent of the lengths involved.
 *
 * Rate limited at the route, in lib/rate-limit.ts, since this comparison is
 * cheap enough to run forever otherwise.
 */
export async function isCorrectPassword(candidate: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("ADMIN_PASSWORD is not set");

  const key = await signingKey();
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(candidate)),
    crypto.subtle.sign("HMAC", key, encoder.encode(expected)),
  ]);

  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}

export const sessionCookie = {
  name: COOKIE,
  maxAge: TTL_SECONDS,
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  },
};

/**
 * What to set to end a session: the same cookie, emptied and expired at once.
 * The cookie is httpOnly, so only the server can do this. A sign out that only
 * forgot the cookie in the browser would leave the session valid for anyone
 * who still had it.
 */
export function clearedSessionCookie() {
  return {
    name: sessionCookie.name,
    value: "",
    options: { ...sessionCookie.options, maxAge: 0 },
  };
}

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

/**
 * What a session signature covers: the expiry, so it cannot be edited, and the
 * current password, so changing the password ends every session. Nothing is
 * stored, so sign out alone cannot reach a copied cookie; a password change can.
 * The password only goes into the HMAC and never into the token itself.
 */
function signedPayload(expiry: string, role: SessionRole): Uint8Array<ArrayBuffer> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is not set");
  // The owner's payload is unchanged from before the demo existed, so sessions
  // already issued stay valid. The demo's starts with a word where the owner's
  // starts with digits, so neither signature can stand in for the other.
  return encoder.encode(role === "demo" ? `${DEMO}.${expiry}.${password}` : `${expiry}.${password}`);
}

/**
 * The owner can do everything. The demo reads the seeded data and nothing
 * else: the proxy refuses its writes and hides settings (#233).
 */
export type SessionRole = "owner" | "demo";

const DEMO = "demo";

async function mint(role: SessionRole, now: number): Promise<string> {
  const expiry = String(Math.floor(now / 1000) + TTL_SECONDS);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    signedPayload(expiry, role),
  );
  const token = `${expiry}.${toBase64Url(signature)}`;
  return role === "demo" ? `${DEMO}.${token}` : token;
}

/** `<expiry>.<signature>`. */
export function mintSession(now = Date.now()): Promise<string> {
  return mint("owner", now);
}

/** `demo.<expiry>.<signature>`, with the role inside the signature too. */
export function mintDemoSession(now = Date.now()): Promise<string> {
  return mint("demo", now);
}

/**
 * A demo session for whoever asks, except an owner who is already signed in.
 * A cross-site form posting to the demo route would otherwise quietly swap the
 * owner's session for a read only one. Null means keep the cookie they have.
 */
export async function demoSessionFor(
  current: string | undefined,
  now = Date.now(),
): Promise<string | null> {
  return (await isValidSession(current, now)) ? null : mintDemoSession(now);
}

/**
 * True only for the owner. Every write guard in the app asks this, so a demo
 * session fails all of them even if the proxy were ever bypassed.
 */
export async function isValidSession(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  return (await sessionRole(token, now)) === "owner";
}

/** Owner or demo: anyone allowed to look at the data. */
export async function canRead(token: string | undefined, now = Date.now()): Promise<boolean> {
  return (await sessionRole(token, now)) !== null;
}

/** Which kind of session a cookie holds, or null for none. */
export async function sessionRole(
  token: string | undefined,
  now = Date.now(),
): Promise<SessionRole | null> {
  if (!token) return null;

  const role: SessionRole = token.startsWith(`${DEMO}.`) ? "demo" : "owner";
  if (role === "demo") token = token.slice(DEMO.length + 1);

  const separator = token.indexOf(".");
  if (separator < 1) return null;

  const expiry = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^\d+$/.test(expiry) || !signature) return null;

  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = fromBase64Url(signature);
  } catch {
    return null;
  }

  // Signature first, expiry second. Checking the expiry of an unverified token
  // would be reading a number an attacker chose.
  const verified = await crypto.subtle.verify(
    "HMAC",
    await signingKey(),
    signatureBytes,
    signedPayload(expiry, role),
  );
  if (!verified) return null;

  return Number(expiry) > Math.floor(now / 1000) ? role : null;
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

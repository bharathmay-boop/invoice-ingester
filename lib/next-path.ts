/**
 * Where to go after signing in.
 *
 * Only a path on this site. `next` arrives in the URL, so anyone can put
 * anything in it, and "//evil.example" is a URL to somewhere else wearing the
 * shape of a path. A sign in page that forwards to another site on request is
 * a phishing tool with your domain on it.
 *
 * Checking the string's prefix is not enough: browsers read "/\evil.example"
 * and "/<tab>/evil.example" as "//evil.example". So the value is parsed the
 * way the router will parse it, and kept only if it stays on this origin.
 */
const BASE = "http://next.invalid";

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return "/";
  }
  if (url.origin !== BASE) return "/";
  return url.pathname + url.search + url.hash;
}

/**
 * Where the demo starts. Findings, unless the visitor was sent here from a
 * particular screen, because findings is what the product is for: what you
 * were billed that disagrees with a contract (#235).
 */
export function demoLanding(next: string | null | undefined): string {
  const path = safeNext(next);
  return path === "/" ? "/findings" : path;
}

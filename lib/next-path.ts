/**
 * Where to go after signing in.
 *
 * Only a path on this site. `next` arrives in the URL, so anyone can put
 * anything in it, and "//evil.example" is a URL to somewhere else wearing the
 * shape of a path. A sign in page that forwards to another site on request is
 * a phishing tool with your domain on it.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

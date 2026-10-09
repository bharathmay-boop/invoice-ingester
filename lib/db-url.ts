/**
 * The connection string with its TLS mode stated outright (#211).
 *
 * `pg` 8 treats `sslmode=require`, `prefer` and `verify-ca` as `verify-full`:
 * the certificate chain and the hostname are both checked. pg 9 will give them
 * libpq's meaning, where `require` encrypts and verifies nothing, so a bump
 * could weaken every connection with no error and no log line. Saying
 * `verify-full` here keeps the check whichever major version is installed.
 *
 * A string with no `sslmode` (a local Postgres) or with `disable` or `allow` is
 * left alone: asking such a server for TLS would only break it.
 */
export function verifyFull(url: string | undefined): string | undefined {
  return url?.replace(/([?&])sslmode=(?:require|prefer|verify-ca)(?=&|$)/, "$1sslmode=verify-full");
}

// The two refusals the screenshot run turns on, kept apart from the script so
// they can be tested. Both exist because these are pictures of authenticated
// screens that get committed to a public repository.

/**
 * Whether the pictures would come from this machine.
 *
 * Anchored on the host rather than matched as a prefix. `http://localhost.evil.com`
 * starts with the right letters and is somebody else's machine, and a prefix
 * check would wave it through.
 */
export function isLocalOrigin(base) {
  let host;
  try {
    ({ hostname: host } = new URL(base));
  } catch {
    return false;
  }
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/**
 * The tables holding rows that are not demo rows, given a count per table.
 * Empty means the database is safe to photograph.
 */
export function realRows(counts) {
  return Object.entries(counts).filter(([, n]) => n > 0);
}

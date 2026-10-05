import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The worker and the sweep are guarded by CRON_SECRET rather than a session,
 * because the chain outlives the request that started it.
 *
 * Both sides are hashed before comparing, so the comparison takes the same
 * time whatever was sent and leaks neither the secret nor its length. Unset
 * means nothing gets in.
 */
export function isCronRequest(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorization) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

/**
 * Where to call the worker. The secret goes with the call, so the address comes
 * from the deployment rather than the incoming Host header, which the caller
 * writes. Production uses its project address, a preview its own deployment,
 * and a local run (no Vercel variables) the origin it is being served on.
 */
export function workerUrl(localOrigin: string): URL {
  const host =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL;
  return new URL("/api/contracts/worker", host ? `https://${host}` : localOrigin);
}

/** Start the next worker without waiting for it. */
export function callWorker(localOrigin: string): void {
  // The catch is there because an unhandled rejection from a request nobody
  // is waiting on would take the calling function down.
  void fetch(workerUrl(localOrigin), {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(() => {});
}

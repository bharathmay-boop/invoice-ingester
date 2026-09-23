import "server-only";
import { PostHog } from "posthog-node";

/**
 * Server side events. No key configured means every call here does nothing, so
 * a checkout without analytics behaves exactly like one with it.
 *
 * Batching is turned off. Each serverless invocation can be frozen the moment
 * the response is sent, so anything still sitting in a queue is lost: the send
 * has to be awaited while the request is still alive.
 */
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

const client = key
  ? new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    })
  : null;

/**
 * One user, so one id. It exists to keep events together rather than to tell
 * anyone apart.
 */
const DISTINCT_ID = "owner";

/**
 * Never throws and never delays a response by more than a moment. Analytics
 * failing is not a reason for an upload to fail, and a provider outage at
 * PostHog should not hold a request open.
 */
export async function track(event: string, properties: Record<string, unknown>): Promise<void> {
  if (!client) return;
  try {
    client.capture({ distinctId: DISTINCT_ID, event, properties });
    await Promise.race([
      client.flush(),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch (error) {
    console.error("analytics", event, error instanceof Error ? error.message : error);
  }
}

/** Crashes, from a route or a rendered page. */
export async function trackError(error: unknown, context: Record<string, unknown> = {}): Promise<void> {
  if (!client) return;
  try {
    await client.captureException(error instanceof Error ? error : new Error(String(error)), DISTINCT_ID, context);
    await Promise.race([client.flush(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  } catch (failure) {
    console.error("analytics error capture", failure instanceof Error ? failure.message : failure);
  }
}

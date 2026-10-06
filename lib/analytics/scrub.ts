/**
 * What analytics is allowed to carry. PostHog is read from a phone and kept by
 * a third party, so it gets codes, counts and where in the code something broke,
 * never what a document said. An error message can quote a vendor or an invoice
 * number, and a query string can hold a search term, so both are dropped here.
 *
 * No "server-only": the browser's error boundaries and PostHog's before_send use
 * the same rules as the server.
 */

/** The error's type and stack frames, without its message. */
export function messageless(error: unknown): Error {
  const original = error instanceof Error ? error : new Error();
  const safe = new Error();
  safe.name = original.name;
  const frames = (original.stack ?? "").split("\n").filter((line) => /^\s+at /.test(line));
  safe.stack = [original.name, ...frames].join("\n");
  return safe;
}

/** A URL without its query string or fragment. Anything else passes through. */
export function withoutQuery<T>(url: T): T | string {
  if (typeof url !== "string") return url;
  return url.split(/[?#]/)[0];
}

type OutgoingEvent = { event: string; properties: Record<string, unknown> } | null;

/** PostHog's before_send: strip query strings and exception text from every event. */
export function scrubEvent<E extends OutgoingEvent>(event: E): E {
  if (!event) return event;
  const p = event.properties;
  for (const key of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer"]) {
    if (key in p) p[key] = withoutQuery(p[key]);
  }
  if (Array.isArray(p.$exception_list)) {
    p.$exception_list = p.$exception_list.map((entry: Record<string, unknown>) => ({ ...entry, value: "" }));
  }
  return event;
}

/**
 * Session replay, when the PostHog project has it switched on. A recording is
 * the rendered page, so without these it would show every vendor, amount and
 * search term on screen. Text and inputs are masked, so a replay still shows
 * layout and clicks, and network capture keeps a request's path but never its
 * query string, headers or bodies.
 */
type CapturedRequest = { name?: string; requestBody?: unknown; responseBody?: unknown } & Record<string, unknown>;

export const replayOptions = {
  maskTextSelector: "*",
  maskAllInputs: true,
  recordHeaders: false,
  recordBody: false,
  maskCapturedNetworkRequestFn<R extends CapturedRequest>(request: R): R {
    const kept = { ...request, name: withoutQuery(request.name) };
    delete kept.requestBody;
    delete kept.responseBody;
    return kept;
  },
};

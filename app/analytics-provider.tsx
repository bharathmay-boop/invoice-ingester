"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { replayOptions, scrubEvent } from "@/lib/analytics/scrub.ts";
import type { EventArgs, EventName } from "@/lib/analytics/events.ts";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (typeof window !== "undefined" && key && !posthog.__loaded) {
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // The App Router changes the URL without a page load, so PostHog's own
    // listener would only ever see the first page.
    capture_pageview: false,
    capture_exceptions: true,
    // Nothing is stored on the device until somebody accepts (#175). Until
    // then, and after a rejection, visits are counted without cookies, by a
    // hash PostHog works out on its own servers, and nothing is replayed.
    cookieless_mode: "on_reject",
    opt_out_capturing_by_default: true,
    persistence: "memory",
    disable_session_recording: true,
    // Clicks are still counted, but the text and attributes of what was clicked
    // are vendor names, item names and invoice numbers. See lib/analytics/scrub.ts.
    mask_all_text: true,
    mask_all_element_attributes: true,
    before_send: scrubEvent,
    session_recording: replayOptions,
  });
}

/** What happens on Accept: an identifier that lasts, history across visits, and replay. */
export function acceptAnalytics(): void {
  // Called on the click and again when the stored choice is read back; once
  // is enough (Kimi K2.5 review on #292).
  if (!key || posthog.has_opted_in_capturing()) return;
  posthog.opt_in_capturing({ captureEventName: false });
  posthog.set_config({ persistence: "localStorage+cookie" });
  posthog.startSessionRecording();
}

/**
 * Back to how it started, which is all a rejection or a withdrawal is: the
 * stored identifier is cleared and nothing more is written.
 */
export function rejectAnalytics(): void {
  if (!key) return;
  posthog.stopSessionRecording();
  posthog.opt_out_capturing();
  posthog.set_config({ persistence: "memory" });
  posthog.reset();
}

/**
 * Page views, sent on every navigation rather than only on first load. The
 * search params are a dependency so a new search still counts as a view, but
 * the query itself is never sent: it is whatever was typed into a search box.
 */
function PageViews() {
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    if (!key) return;
    posthog.capture("$pageview", { $current_url: `${window.location.origin}${pathname}` });
  }, [pathname, params]);

  return null;
}

/**
 * Without a key this renders its children and nothing else, so the app runs
 * the same on a checkout with no analytics configured.
 */
export function Analytics({ children }: { children: React.ReactNode }) {
  if (!key) return <>{children}</>;

  return (
    <PostHogProvider client={posthog}>
      <PageViews />
      {children}
    </PostHogProvider>
  );
}

/** Used by the screens. A no-op when analytics is not configured. */
export function capture<E extends EventName>(event: E, ...args: EventArgs<E>): void {
  if (!key) return;
  posthog.capture(event, args[0]);
}

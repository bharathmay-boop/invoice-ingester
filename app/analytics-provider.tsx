"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { scrubEvent } from "@/lib/analytics/scrub.ts";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (typeof window !== "undefined" && key && !posthog.__loaded) {
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // The App Router changes the URL without a page load, so PostHog's own
    // listener would only ever see the first page.
    capture_pageview: false,
    capture_exceptions: true,
    persistence: "localStorage+cookie",
    // Clicks are still counted, but the text and attributes of what was clicked
    // are vendor names, item names and invoice numbers. See lib/analytics/scrub.ts.
    mask_all_text: true,
    mask_all_element_attributes: true,
    before_send: scrubEvent,
  });
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
export function capture(event: string, properties?: Record<string, unknown>): void {
  if (!key) return;
  posthog.capture(event, properties);
}

"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { currentChoice, recordChoice, type Choice } from "@/lib/analytics/consent.ts";
import { acceptAnalytics, rejectAnalytics } from "./analytics-provider.tsx";

const CHANGED = "consent-change";
const REOPEN = "consent-reopen";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function snapshot(): Choice | "none" {
  try {
    const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
    return currentChoice(localStorage, gpc) ?? "none";
  } catch {
    // Storage blocked: treat as not chosen, which keeps the safe default.
    return "none";
  }
}

/** The choice in force, or "server" while rendering where there is no browser. */
export function useConsent(): Choice | "none" | "server" {
  return useSyncExternalStore(subscribe, snapshot, () => "server");
}

export function choose(choice: Choice) {
  try {
    recordChoice(localStorage, choice);
  } catch {
    // Not recorded, so the banner asks again next time, which is the safe way round.
  }
  if (choice === "accepted") acceptAnalytics();
  else rejectAnalytics();
  window.dispatchEvent(new Event(CHANGED));
}

/** Opens the banner again, from the footer or Settings, so withdrawing is as easy as giving. */
export function ConsentChoices({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(REOPEN))}>
      Cookie choices
    </button>
  );
}

/**
 * Asks once, before anything is stored, with Reject exactly as easy as
 * Accept: same size, same style, same single click, on the first layer
 * (#175). Nothing is gated behind it; the app works whatever is chosen.
 */
export function ConsentBanner() {
  const choice = useConsent();
  const configured = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
  const [reopened, setReopened] = useState(false);

  // A choice made on an earlier visit is applied again on this one.
  useEffect(() => {
    if (choice === "accepted") acceptAnalytics();
  }, [choice]);

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(REOPEN, open);
    return () => window.removeEventListener(REOPEN, open);
  }, []);

  // No analytics configured means nothing to ask about.
  if (!configured || choice === "server" || (choice !== "none" && !reopened)) return null;

  const decide = (next: Choice) => {
    choose(next);
    setReopened(false);
  };

  return (
    <div role="region" aria-label="Cookie choices" className="fixed inset-x-0 bottom-0 z-50 p-4">
      <Card className="mx-auto max-w-2xl shadow-lg">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            We count visits without cookies. With your OK we also keep an identifier, so we can see
            how the product is used across visits, and record sessions with every word masked.{" "}
            <Link href="/cookies" className="underline underline-offset-4">
              What is stored
            </Link>
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => decide("rejected")}>
              Reject
            </Button>
            <Button variant="outline" onClick={() => decide("accepted")}>
              Accept
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

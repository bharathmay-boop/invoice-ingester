"use client";

import { useEffect } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";

/**
 * A crash inside the app. Reported rather than swallowed, and shown as
 * something a person can act on instead of a blank screen.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) posthog.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold">Something broke</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        The error has been reported. Nothing you were working on was saved, so
        trying again is safe.
      </p>
      {error.digest && (
        <p className="text-muted-foreground mt-2 font-mono text-xs">Reference {error.digest}</p>
      )}
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/">Go to the start</Link>
        </Button>
      </div>
    </main>
  );
}

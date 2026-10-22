"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { capture } from "./analytics-provider.tsx";
import { demoLanding } from "@/lib/next-path.ts";
import { Button } from "@/components/ui/button";

/**
 * Starts a read only demo session and opens the app, in one click, from the
 * sign in page or the home page (#235).
 */
export function TryDemo({
  next,
  className,
  size = "lg",
  variant,
}: {
  next?: string | null;
  className?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function start() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/session/demo", { method: "POST" });
      // 409 means the owner is already signed in, which is a way in too.
      if (!response.ok && response.status !== 409) throw new Error();
    } catch {
      setFailed(true);
      setBusy(false);
      return;
    }
    capture("demo_started");
    router.push(demoLanding(next));
    router.refresh();
  }

  return (
    <span className="flex flex-col gap-2">
      <Button size={size} variant={variant} onClick={start} disabled={busy} className={className}>
        {busy ? "Opening the demo…" : "Try the demo"}
      </Button>
      {failed && (
        <span role="alert" className="text-destructive text-xs">
          Could not start the demo. Try again.
        </span>
      )}
    </span>
  );
}

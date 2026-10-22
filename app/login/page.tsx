"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { capture } from "../analytics-provider.tsx";
import { demoLanding, safeNext } from "@/lib/next-path.ts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function Login() {
  const router = useRouter();
  const rawNext = useSearchParams().get("next");
  const next = safeNext(rawNext);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"owner" | "demo" | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy("owner");
    setError(null);

    let response: Response;
    try {
      response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
    } catch {
      // A rejected fetch never reaches the branches below, so without this the
      // form stays disabled on "Signing in…" and the only way out is a reload.
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(null);
      return;
    }

    if (response.ok) {
      capture("signed_in");
      router.push(next);
      router.refresh();
      return;
    }

    const body = await response.json().catch(() => ({}));
    setError(body.error ?? "Could not sign in.");
    setBusy(null);
  }

  async function tryDemo() {
    setBusy("demo");
    setError(null);
    try {
      const response = await fetch("/api/session/demo", { method: "POST" });
      // 409 means the owner is already signed in, which is a way in too.
      if (!response.ok && response.status !== 409) throw new Error();
    } catch {
      setError("Could not start the demo. Check your connection and try again.");
      setBusy(null);
      return;
    }
    capture("demo_started");
    router.push(demoLanding(rawNext));
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Two ways in</CardTitle>
          <CardDescription>
            The demo opens the whole app on invented invoices and contracts. Nothing in it can be
            changed, and no password is needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Button size="lg" onClick={tryDemo} disabled={busy !== null}>
            {busy === "demo" ? "Opening the demo…" : "Try the demo"}
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs">or sign in as the owner</span>
            <Separator className="flex-1" />
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={error ? "password-error" : undefined}
              aria-invalid={error ? true : undefined}
            />
            <Button type="submit" variant="outline" disabled={busy !== null || !password}>
              {busy === "owner" ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          {error && (
            <p id="password-error" role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

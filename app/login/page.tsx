"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { capture } from "../analytics-provider.tsx";
import { safeNext } from "@/lib/next-path.ts";
import { useState } from "react";

export default function Login() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
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
      setBusy(false);
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
    setBusy(false);
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 px-6 py-24">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm opacity-70">
          Reading is open to everyone. The password is only needed to upload
          invoices and change settings.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={error ? "password-error" : undefined}
          aria-invalid={error ? true : undefined}
          className="rounded border border-black/20 px-3 py-2 text-sm dark:border-white/25"
        />

        {error && (
          <p id="password-error" role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !password}
          className="rounded bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

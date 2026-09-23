"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { capture } from "./analytics-provider.tsx";

// ponytail: no suggestions link and no waiting count until there is a
// suggestions screen to point at. A nav item that goes nowhere is worse than
// a missing one.
const LINKS = [
  { href: "/upload", label: "Upload" },
  { href: "/items", label: "Items" },
  { href: "/vendors", label: "Vendors" },
];

function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      // The cookie is httpOnly, so only the server can clear it. Clearing it
      // in the browser is not possible and would not end the session anyway.
      await fetch("/api/session", { method: "DELETE" });
      capture("signed_out");
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={signOut} disabled={busy}>
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}

export function Nav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();

  // Settings does not exist when signed out, per the spec, so it is not linked
  // either. Linking it would 404 on click and, because Next prefetches, log an
  // error on every page load before anyone clicked anything.
  const links = signedIn ? [...LINKS, { href: "/settings", label: "Settings" }] : LINKS;

  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3 sm:px-6"
      >
        <Link href="/" className="mr-3 text-sm font-semibold">
          Invoice Ingester
        </Link>

        {links.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              // Weight and an underline carry the current state, not colour
              // alone.
              className={`rounded px-2 py-1 text-sm ${
                active
                  ? "font-semibold underline underline-offset-4"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              {link.label}
            </Link>
          );
        })}

        <span className="ml-auto text-sm">
          {signedIn ? (
            <SignOut />
          ) : (
            <Link href="/login" className="underline opacity-70 hover:opacity-100">
              Sign in
            </Link>
          )}
        </span>
      </nav>
    </header>
  );
}

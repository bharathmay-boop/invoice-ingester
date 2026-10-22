"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { capture } from "./analytics-provider.tsx";
import type { SessionRole } from "@/lib/auth.ts";
import { MenuIcon } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { COUNTED, linksFor, PUBLIC_LINKS, SOURCE_URL } from "./nav-links.ts";
import { TryDemo } from "./try-demo.tsx";

function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setBusy(true);
    setFailed(false);
    try {
      // The cookie is httpOnly, so only the server can clear it, and only a
      // response that actually carries the expired cookie has ended the
      // session. Navigating away on a failed request would look signed out
      // while the session stayed valid, which on a shared machine is the whole
      // problem this button exists to solve.
      const response = await fetch("/api/session", { method: "DELETE" });
      if (!response.ok) {
        setFailed(true);
        return;
      }
      capture("signed_out");
      router.push("/");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {failed && (
        <span role="alert" className="text-destructive text-xs">
          Could not sign out. Still signed in.
        </span>
      )}
      <Button variant="ghost" size="sm" onClick={signOut} disabled={busy}>
        {busy ? "Signing out…" : failed ? "Try again" : "Sign out"}
      </Button>
    </span>
  );
}

/** What a signed out visitor gets: the home page's sections, the source, and two ways in. */
function PublicLinks() {
  const sections = PUBLIC_LINKS.map((link) => (
    <Link key={link.href} href={link.href} className="rounded px-2 py-1 text-sm opacity-70 hover:opacity-100">
      {link.label}
    </Link>
  ));
  const source = (
    <a key="source" href={SOURCE_URL} className="rounded px-2 py-1 text-sm opacity-70 hover:opacity-100">
      GitHub
    </a>
  );
  const signIn = (
    <Link key="login" href="/login" className="rounded px-2 py-1 text-sm opacity-70 hover:opacity-100">
      Sign in
    </Link>
  );

  return (
    <>
      <span className="hidden items-center gap-x-1 sm:flex">{sections}</span>
      <span className="ml-auto hidden items-center gap-x-1 sm:flex">
        {source}
        {signIn}
        <TryDemo size="sm" />
      </span>

      {/* On a phone the links fold into a sheet, and the demo stays in reach. */}
      <span className="ml-auto flex items-center gap-2 sm:hidden">
        <TryDemo size="sm" />
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open the menu">
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Invoice Ingester</SheetTitle>
              <SheetDescription>Invoices checked against the contracts behind them.</SheetDescription>
            </SheetHeader>
            <nav aria-label="Sections" className="flex flex-col gap-1 px-2">
              {/* Each closes the sheet, or a section link scrolls the page behind it. */}
              {[...sections, source, signIn].map((link) => (
                <SheetClose key={link.key} asChild>
                  {link}
                </SheetClose>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </span>
    </>
  );
}

export function Nav({
  role,
  waiting = 0,
  findings = 0,
}: {
  role: SessionRole | null;
  waiting?: number;
  findings?: number;
}) {
  const counts: Record<string, number> = { "/suggestions": waiting, "/findings": findings };
  const pathname = usePathname();

  // Linking a screen the proxy would bounce promises something that is not
  // there, and Next prefetches, so it would also fire a redirect on every page
  // load before anyone clicked anything.
  const links = linksFor(role);
  const signedIn = role !== null;

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
              {COUNTED.has(link.href) && (counts[link.href] ?? 0) > 0 && (
                <span className="bg-secondary text-secondary-foreground ml-1.5 rounded-full px-1.5 py-0.5 text-xs tabular-nums">
                  {counts[link.href]}
                </span>
              )}
            </Link>
          );
        })}

        {signedIn ? (
          <span className="ml-auto text-sm">
            <SignOut />
          </span>
        ) : (
          <PublicLinks />
        )}
      </nav>
    </header>
  );
}

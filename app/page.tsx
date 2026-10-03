import Link from "next/link";
import { cookies } from "next/headers";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { FlowHero } from "./flow-hero.tsx";
import { HomeWalkthrough } from "./home-walkthrough.tsx";
import { WhatItAnswers } from "./what-it-answers.tsx";

export const dynamic = "force-dynamic";

/**
 * The one page a visitor without an account can reach, so it carries the whole
 * story on its own.
 *
 * It shows no stored data, not even aggregates. Tables of someone else's
 * invoices teach nobody what this is for, and the figures on this page are
 * invented so nothing here is anyone's real spending.
 */
export default async function Home() {
  const jar = await cookies();
  const signedIn = await isValidSession(jar.get(sessionCookie.name)?.value);

  return (
    <main className="flex-1">
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_minmax(0,28rem)] lg:gap-14 lg:py-20">
        <div>
          <p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.2em]">
            Invoice Ingester
          </p>
          <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Invoices you have already paid, turned into answers.
          </h1>
          {/*
            One line, because the diagram beside it already shows the pipeline
            and the tabs below already demonstrate each answer. Saying it in
            prose as well meant a visitor read the same thing three times
            before reaching a button.
          */}
          <p className="text-muted-foreground mt-5 max-w-md text-lg leading-relaxed">
            Drop them in with the contracts behind them. Find out what you were
            charged against what you agreed.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {signedIn ? (
              <>
                <Button asChild size="lg">
                  <Link href="/upload">Upload an invoice</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/items">See what things cost</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#how">See how it works</a>
                </Button>
              </>
            )}
          </div>
          {!signedIn && (
            <p className="text-muted-foreground mt-3 text-xs">
              Behind a password, since it holds real invoices. Everything below
              is drawn to match the real screens, with invented figures.
            </p>
          )}
        </div>

        <FlowHero />
      </section>

      <Separator />

      <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-8 px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
          What happens to a file before it counts.
        </p>
        <div className="mt-6">
          <HomeWalkthrough />
        </div>
      </section>

      <Separator />

      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">What it answers</h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
          Pick a question.
        </p>
        <div className="mt-6">
          <WhatItAnswers />
        </div>
      </section>

      {!signedIn && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6">
          <div className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-xl border p-6">
            <p className="max-w-xl text-sm leading-relaxed">
              Those are drawings of the real screens. To use the real ones on
              your own invoices, sign in.
            </p>
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </section>
      )}

      <footer className="border-border mt-6 border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs sm:px-6">
          <p>
            Every figure, name and quoted line on this page is invented,
            including the contract it cites. None of it is anyone&rsquo;s real
            spending or anyone&rsquo;s real agreement.
          </p>
          <Link
            href="https://github.com/bharathmay-boop/invoice-ingester"
            className="underline underline-offset-4"
          >
            Source and the issue board
          </Link>
        </div>
      </footer>
    </main>
  );
}

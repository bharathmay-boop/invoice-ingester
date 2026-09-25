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
          <p className="text-muted-foreground mt-5 max-w-lg text-base leading-relaxed">
            Drop in a PDF or a photo. The particulars come out, the vendor is
            resolved by GSTIN, and line items are matched once their
            descriptions are normalised, so a ream of A4 is the same thing
            whether it was typed as a pack or a box. Then you can ask what a
            thing has cost you over time, and who you pay the most.
          </p>

          {/* The thesis, stated once, next to the invoice that demonstrates it. */}
          <p className="mt-5 max-w-lg text-base leading-relaxed">
            Every invoice has to add up before it counts. The line items must
            sum to the subtotal, and the subtotal plus taxes must equal the
            total. One that disagrees with itself is held for you to look at
            rather than quietly folded into a spend figure.
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
              The app itself is behind the password, since it holds real
              invoices. Everything below shows what it does.
            </p>
          )}
        </div>

        <FlowHero />
      </section>

      <Separator />

      <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-8 px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
          Three steps, in the order you would do them.
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
              The screens above are the real ones. To use them on your own
              invoices, sign in.
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
            Every figure on this page is invented, so none of it is anyone&rsquo;s
            real spending.
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

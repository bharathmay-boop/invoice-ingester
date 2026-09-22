import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { listItems, listVendors } from "@/lib/queries.ts";
import { money, moneyRounded } from "@/lib/format.ts";
import { InvoiceSpecimen } from "./invoice-specimen.tsx";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [vendors, items] = await Promise.all([listVendors(), listItems()]);

  const spend = vendors.reduce((sum, v) => sum + v.spend, 0);
  const toCheck = vendors.reduce((sum, v) => sum + v.needs_review, 0);
  const invoices = vendors.reduce((sum, v) => sum + v.invoice_count, 0);
  const topItem = items[0];

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
            resolved by GSTIN, and line items are matched across however many
            ways they were spelled. Then you can ask what a thing has cost you
            over time, and who you pay the most.
          </p>

          {/* The thesis, stated once, next to the invoice that demonstrates it. */}
          <p className="mt-5 max-w-lg text-base leading-relaxed">
            Every invoice has to add up before it counts. The line items must
            sum to the subtotal, and the subtotal plus taxes must equal the
            total. One that disagrees with itself is held for you to look at
            rather than quietly folded into a spend figure.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/items">See what things cost</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/vendors">Browse vendors</Link>
            </Button>
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            Reading is open to everyone. Uploading needs the password.
          </p>
        </div>

        <InvoiceSpecimen />
      </section>

      <Separator />

      {/* Real figures from the data actually in the database, not a mock. */}
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <h2 className="text-muted-foreground font-mono text-xs uppercase tracking-[0.2em]">
          Currently stored
        </h2>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
          <Figure label="Total spend" value={moneyRounded(spend)} note="Confirmed invoices only" />
          <Figure label="Invoices" value={String(invoices)} note={`Across ${vendors.length} vendors`} />
          <Figure label="Catalogue" value={String(items.length)} note="Distinct things bought" />
          <Figure
            label="Held"
            value={String(toCheck)}
            note={toCheck ? "Figures disagree" : "Everything adds up"}
            flagged={toCheck > 0}
          />
        </dl>
      </section>

      <Separator />

      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">What it answers</h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          <Answer
            question="What have I been paying for this?"
            href="/items"
            cta="Open items"
          >
            Every purchase of one thing, across vendors and dates, with the unit
            price over time and which vendor is cheapest now.
            {topItem && (
              <>
                {" "}Most spent so far: {topItem.canonical_name}, {money(topItem.spend)}.
              </>
            )}
          </Answer>
          <Answer question="Who am I paying the most?" href="/vendors" cta="Open vendors">
            Every vendor by total spend, and each one&rsquo;s invoices with the
            ones still needing a look marked.
          </Answer>
          <Answer question="Which invoices do not add up?" href="/vendors" cta="See what is held">
            Anything whose own figures disagree is kept out of the totals and
            flagged, with the disagreeing numbers shown.
          </Answer>
        </div>
      </section>

      <Separator />

      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <Step field="Upload">
            A PDF or a photo. Anything unreadable is refused at the dropzone,
            with the reason on that file.
          </Step>
          <Step field="Extract">
            A vision model reads it against a fixed schema. Claude or OpenRouter,
            your key, chosen in settings.
          </Step>
          <Step field="Check">
            Both arithmetic checks run before anything is stored. Failing either
            holds the invoice instead of confirming it.
          </Step>
          <Step field="Confirm">
            The original sits beside the editable fields. Nothing is saved until
            you say so, and a duplicate is refused by the database.
          </Step>
        </div>
      </section>

      <footer className="border-border mt-6 border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs sm:px-6">
          <p>
            Built with made up invoices, so the figures above are a demonstration
            rather than anyone&rsquo;s real spending.
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

function Figure({
  label,
  value,
  note,
  flagged = false,
}: {
  label: string;
  value: string;
  note: string;
  flagged?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</dt>
      <dd
        className={`mt-1 font-mono text-2xl tabular-nums sm:text-3xl ${
          flagged ? "text-amber-700 dark:text-amber-400" : ""
        }`}
      >
        {value}
      </dd>
      <dd className="text-muted-foreground mt-1 text-xs">{note}</dd>
    </div>
  );
}

function Answer({
  question,
  href,
  cta,
  children,
}: {
  question: string;
  href: string;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <h3 className="text-base font-medium">{question}</h3>
      <p className="text-muted-foreground mt-2 flex-1 text-sm leading-relaxed">{children}</p>
      <p className="mt-4">
        <Link
          href={href}
          className="text-sm underline underline-offset-4 hover:no-underline"
        >
          {cta}
        </Link>
      </p>
    </div>
  );
}

/**
 * Labelled with the stage of the invoice's own journey rather than 01/02/03.
 * The order matters here, but the names carry more than the numbers would.
 */
function Step({ field, children }: { field: string; children: React.ReactNode }) {
  return (
    <div className="border-border border-t pt-4">
      <h3 className="font-mono text-xs uppercase tracking-[0.15em]">{field}</h3>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{children}</p>
    </div>
  );
}

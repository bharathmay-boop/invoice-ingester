import { CheckIcon, FileTextIcon, QuoteIcon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/reveal.tsx";
import { MAX_CONTRACT_PAGES, MAX_CONTRACTS_PER_BATCH } from "@/lib/contracts/limits.ts";

/**
 * The contract check on its own, because it is what an extraction tool does
 * not do: the agreed rates, read out of the contract with the words that set
 * them, and every invoice line held against them (#240).
 *
 * Drawn to match the real screens, with invented figures.
 */
export function ContractsSection() {
  return (
    <section id="contracts" className="mx-auto w-full max-w-6xl scroll-mt-8 px-4 py-12 sm:px-6">
      <Reveal>
        <h2 className="text-2xl font-semibold tracking-tight">Contracts, checked line by line</h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
          Upload the agreements behind your vendors. Every invoice line is then held against the
          rate you agreed, for the period it was agreed for.
        </p>
      </Reveal>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Reveal delay={0.05}>
          <Step
            title="A long PDF, read in the background"
            description={`Up to ${MAX_CONTRACT_PAGES} pages each, ${MAX_CONTRACTS_PER_BATCH} at a time. You can leave the page while it reads.`}
          >
            <div className="border-border rounded-lg border px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <FileTextIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  <span className="truncate">Supply agreement 2026-27.pdf</span>
                </span>
                <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                  page 18 of 42
                </span>
              </div>
              <span className="bg-muted mt-3 block h-1 overflow-hidden rounded-full" aria-hidden>
                <span className="bg-primary block h-full w-[43%]" />
              </span>
            </div>
          </Step>
        </Reveal>

        <Reveal delay={0.1}>
          <Step
            title="Every rate, with its page and its words"
            description="Each rate comes back with the line of the contract that set it, found on the page it is actually on."
          >
            <ul className="space-y-2 text-sm">
              {[
                { item: "A4 Paper 500 Sheets", rate: "₹265.00 a ream", page: 3 },
                { item: "File Folder A4", rate: "₹22.00 a piece", page: 3 },
                { item: "Whiteboard Marker Black", rate: "₹420.00 a box of 10", page: 4 },
              ].map((rate) => (
                <li
                  key={rate.item}
                  className="border-border flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border px-4 py-2"
                >
                  <span>{rate.item}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="tabular-nums">{rate.rate}</span>
                    <span className="text-muted-foreground text-xs">page {rate.page}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Step>
        </Reveal>

        <Reveal delay={0.15}>
          <Step
            title="Nothing counts until you confirm it"
            description="A contract that has been read but not checked by a person affects no invoice. You confirm the vendor, the period and each rate against the original."
          >
            <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm">
              <span className="flex items-center gap-2">
                <QuoteIcon className="text-muted-foreground size-4" aria-hidden />
                12 rates, 1 April 2026 to 31 March 2027
              </span>
              <Badge variant="secondary">Waiting for you</Badge>
            </div>
            <p className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
              <CheckIcon className="size-3.5" aria-hidden />
              Once confirmed, every invoice in its period is checked, including ones already saved.
            </p>
          </Step>
        </Reveal>

        <Reveal delay={0.2}>
          <Step
            title="Held invoices land in Findings"
            description="One list of what you were billed that disagrees with a contract, each with the invoice line, the agreed rate and the quoted words."
          >
            <div className="border-destructive/40 bg-destructive/5 rounded-lg border px-4 py-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <TriangleAlertIcon className="size-4" aria-hidden />
                Billed above contract
              </p>
              <p className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">6 lines across 3 vendors</span>
                <span className="text-destructive font-medium tabular-nums">₹575.00</span>
              </p>
            </div>
          </Step>
        </Reveal>
      </div>
    </section>
  );
}

function Step({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ArrowRightIcon,
  CheckIcon,
  FileTextIcon,
  PauseIcon,
  PlayIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { rowDelay, STEPS } from "./walkthrough-steps.ts";

/**
 * The four things that happen to a file before it counts, shown rather than
 * described: it is read, its arithmetic is checked, its lines and vendor are
 * matched to what is already known, and its rates are checked against the
 * contract (#238).
 *
 * What you can then ask of it used to be a third panel here, and it drew the
 * same price history the questions section below draws. One of the two had to
 * go, and this is the section about mechanism, so the answer went to the
 * section about answers.
 *
 * It runs on a timer because a signed out visitor cannot do any of it
 * themselves, and a screenshot of a progress row says nothing about what
 * waiting on one feels like. Every figure here is invented; the footer says
 * so once for the whole page (#244).
 */

const STAGES = STEPS;
type Stage = (typeof STAGES)[number];

const HOLD_MS = 4200;

const QUIET = "(prefers-reduced-motion: reduce)";

function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia(QUIET);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const motionIsReduced = () => window.matchMedia(QUIET).matches;

export function HomeWalkthrough() {
  const [stage, setStage] = useState<string>(STAGES[0]);
  // Nobody asked for this to move. Someone whose system asks for less motion
  // gets the panels to read at their own pace, and the control below still
  // lets them start it. Read as an external store rather than in an effect, so
  // the server and the first client render agree on "not reduced".
  const reducedMotion = useSyncExternalStore(subscribeToMotion, motionIsReduced, () => false);
  const [choice, setChoice] = useState<boolean | null>(null);
  // Held still while someone is actually on it: reading a panel, or tabbing
  // through the controls. The Pause button is the lasting answer, this is the
  // courtesy in between.
  const [touched, setTouched] = useState(false);
  const wanted = choice ?? !reducedMotion;
  const playing = wanted && !touched;

  useEffect(() => {
    if (!playing) return;
    const next = setTimeout(() => {
      setStage((current) => STAGES[(STAGES.indexOf(current as Stage) + 1) % STAGES.length]);
    }, HOLD_MS);
    return () => clearTimeout(next);
  }, [stage, playing]);

  return (
    <div
      onMouseEnter={() => setTouched(true)}
      onMouseLeave={() => setTouched(false)}
      onFocus={() => setTouched(true)}
      onBlur={() => setTouched(false)}
    >
      <Tabs value={stage} onValueChange={setStage}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            {STAGES.map((label) => (
              <TabsTrigger key={label} value={label}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Anything that changes on its own needs a way to stop it, and a
              hover is not one: it does not exist on a phone and it does not
              help someone reading with a screen reader. */}
          <Button variant="ghost" size="sm" onClick={() => setChoice(!wanted)}>
            {wanted ? (
              <>
                <PauseIcon /> Pause
              </>
            ) : (
              <>
                <PlayIcon /> Play
              </>
            )}
          </Button>
        </div>

        <TabsContent value="Read" className="mt-4">
          <Panel>
            <ReadIt />
          </Panel>
        </TabsContent>
        <TabsContent value="Check" className="mt-4">
          <Panel>
            <CheckIt />
          </Panel>
        </TabsContent>
        <TabsContent value="Match" className="mt-4">
          <Panel>
            <MatchIt />
          </Panel>
        </TabsContent>
        <TabsContent value="Contract" className="mt-4">
          <Panel>
            <ContractIt />
          </Panel>
        </TabsContent>
      </Tabs>

    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-card min-h-[19rem] rounded-xl border p-5 sm:p-6">{children}</div>
  );
}

/** The upload row, mid flight, the way it looks while a model is reading. */
function ReadIt() {
  return (
    <div>
      <Caption>
        Drop in a PDF or a photo. One file can hold several invoices, and each
        one comes back on its own.
      </Caption>

      <div className="border-border relative mt-5 overflow-hidden rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="flex flex-col">
            <span className="text-sm font-medium">AMJ_Invoice PDF.pdf</span>
            <span className="flex items-center gap-1.5 text-xs">
              <CheckIcon className="text-primary size-3.5" aria-hidden /> Upload
              <span className="bg-border mx-1 h-px w-4" aria-hidden />
              <Spinner className="size-3.5 motion-reduce:animate-none" aria-hidden /> Read
              <span className="bg-border mx-1 h-px w-4" aria-hidden />
              <span className="bg-border size-1.5 rounded-full" aria-hidden />
              <span className="text-muted-foreground">Check</span>
            </span>
          </span>
          <span className="text-muted-foreground text-xs">Reading the invoice · 6s</span>
        </div>
        <span className="bg-muted absolute inset-x-0 bottom-0 h-0.5 overflow-hidden" aria-hidden>
          <span className="bg-primary animate-indeterminate block h-full w-1/4 motion-reduce:animate-none" />
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {[
          { number: "INV/26-27/003", pages: "Pages 1 to 2" },
          { number: "INV/26-27/002", pages: "Pages 3 to 4" },
          { number: "INV/26-27/001", pages: "Page 5" },
        ].map((invoice, i) => (
          <li
            key={invoice.number}
            className="border-border flex items-center justify-between gap-3 rounded-lg border px-4 py-2 text-sm motion-safe:animate-[fade-up_0.5s_ease-out_backwards]"
            style={{ animationDelay: `${rowDelay(i)}s` }}
          >
            <span className="flex items-center gap-2">
              <FileTextIcon className="text-muted-foreground size-4" aria-hidden />
              {invoice.number}
              <span className="text-muted-foreground text-xs">{invoice.pages}</span>
            </span>
            <span className="text-muted-foreground text-xs">Ready to review</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The arithmetic check doing the one job it exists for. */
function CheckIt() {
  return (
    <div>
      <Caption>
        Every invoice has to add up before it counts. A total that disagrees
        with its own line items is held rather than folded into your spend.
      </Caption>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <dl className="border-border space-y-2 rounded-lg border p-4 text-sm">
          <Row label="Microgreens Harvested, 14 × ₹230" value="₹3,220.00" />
          <Row label="Subtotal" value="₹3,220.00" />
          <Row label="CGST + SGST" value="₹0.00" />
          <div className="border-border border-t pt-2">
            <Row label="Total, as printed" value="₹3,500.00" off />
          </div>
        </dl>

        <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-4 motion-safe:animate-[fade-up_0.5s_ease-out_0.3s_backwards]">
          <p className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlertIcon className="size-4" aria-hidden />
            These figures do not add up
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            The total is ₹280.00 more than the subtotal plus taxes.
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Held for checking, next to the original, with nothing saved until
            you say so.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The same paper under three names, and a vendor known by its tax number
 * rather than how it spells itself.
 */
function MatchIt() {
  const lines = [
    { printed: "Paper, A4, 1 ream", item: "A4 Paper 500 Sheets", how: "Taught once, matched since" },
    { printed: "A4 copier paper 75gsm", item: "A4 Paper 500 Sheets", how: "Close match, waiting for you" },
    { printed: "Marker, black (box of 10)", item: "Whiteboard Marker Black", how: "Box against piece, kept apart" },
  ];
  return (
    <div>
      <Caption>
        Lines become items you can follow across vendors, and a vendor is
        recognised by its tax number. Anything unsure waits for a person
        instead of being merged on a guess.
      </Caption>

      <p className="border-border mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-4 py-2 text-sm">
        <span className="font-medium">Nandi Stationers</span>
        <span className="text-muted-foreground font-mono text-xs">GSTIN 29AABCN1234F1Z5</span>
        <span className="text-muted-foreground text-xs">matched to the vendor you already have</span>
      </p>

      <ul className="mt-3 space-y-2">
        {lines.map((line, i) => (
          <li
            key={line.printed}
            className="border-border grid gap-1 rounded-lg border px-4 py-2 text-sm motion-safe:animate-[fade-up_0.5s_ease-out_backwards] sm:grid-cols-[1fr_auto_1fr_auto] sm:items-center sm:gap-3"
            style={{ animationDelay: `${rowDelay(i)}s` }}
          >
            <span className="text-muted-foreground">{line.printed}</span>
            <ArrowRightIcon className="text-muted-foreground hidden size-4 sm:block" aria-hidden />
            <span className="font-medium">{line.item}</span>
            <span className="text-muted-foreground text-xs">{line.how}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A rate billed above the one agreed, held with the line that agreed it. */
function ContractIt() {
  return (
    <div>
      <Caption>
        Each line is checked against the contract in force on the invoice date.
        A rate above the agreed one is held, with the page and the words in the
        contract that set it.
      </Caption>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <dl className="border-border space-y-2 rounded-lg border p-4 text-sm">
          <Row label="A4 Paper 500 Sheets, billed" value="₹279.00 a ream" off />
          <Row label="Agreed in the contract" value="₹265.00 a ream" />
          <Row label="Reams on this invoice" value="20" />
          <div className="border-border border-t pt-2">
            <Row label="Billed above the contract" value="₹280.00" off />
          </div>
        </dl>

        <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-4 motion-safe:animate-[fade-up_0.5s_ease-out_0.3s_backwards]">
          <p className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlertIcon className="size-4" aria-hidden />
            Held: billed above the contract
          </p>
          <blockquote className="border-border text-muted-foreground mt-2 border-l-2 pl-3 text-sm italic">
            &ldquo;A4 copier paper, 500 sheets: Rs 265 per ream.&rdquo;
          </blockquote>
          <p className="text-muted-foreground mt-2 text-xs">Supply agreement, page 3</p>
        </div>
      </div>
    </div>
  );
}

/** What the whole thing is for: one item, one price, over time. */
function Caption({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">{children}</p>;
}

function Row({ label, value, off = false }: { label: string; value: string; off?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${off ? "text-destructive font-medium" : ""}`}>{value}</dd>
    </div>
  );
}

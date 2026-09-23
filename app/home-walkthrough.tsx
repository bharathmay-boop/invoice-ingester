"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckIcon, FileTextIcon, PauseIcon, PlayIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The three things the product does, shown rather than described: a file being
 * read, a figure being caught, and a price history worth having.
 *
 * It runs on a timer because a signed out visitor cannot do any of it
 * themselves, and a screenshot of a progress row says nothing about what
 * waiting on one feels like. Every figure here is invented, and the panel says
 * so, so nobody mistakes it for real spending.
 */

const STAGES = ["Read it", "Check it", "Ask it"] as const;
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
  const playing = choice ?? !reducedMotion;

  useEffect(() => {
    if (!playing) return;
    const next = setTimeout(() => {
      setStage((current) => STAGES[(STAGES.indexOf(current as Stage) + 1) % STAGES.length]);
    }, HOLD_MS);
    return () => clearTimeout(next);
  }, [stage, playing]);

  return (
    <div>
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
          <Button variant="ghost" size="sm" onClick={() => setChoice(!playing)}>
            {playing ? (
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

        <TabsContent value="Read it" className="mt-4">
          <Panel>
            <ReadIt />
          </Panel>
        </TabsContent>
        <TabsContent value="Check it" className="mt-4">
          <Panel>
            <CheckIt />
          </Panel>
        </TabsContent>
        <TabsContent value="Ask it" className="mt-4">
          <Panel>
            <AskIt />
          </Panel>
        </TabsContent>
      </Tabs>

      <p className="text-muted-foreground mt-3 text-xs">
        Invented invoices, so every figure here is a demonstration rather than
        anyone&rsquo;s real spending.
      </p>
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
            style={{ animationDelay: `${0.5 + i * 0.35}s` }}
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

        <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-4 motion-safe:animate-[fade-up_0.5s_ease-out_0.6s_backwards]">
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

/** What the whole thing is for: one item, one price, over time. */
function AskIt() {
  const points = [
    { date: "Apr", price: 212 },
    { date: "May", price: 230 },
    { date: "Jul", price: 228 },
    { date: "Sep", price: 249 },
  ];
  const max = 260;
  const min = 200;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (p: number) => 100 - ((p - min) / (max - min)) * 100;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.price)}`).join(" ");

  return (
    <div>
      <Caption>
        Line items are matched to one catalogue entry however they were typed,
        so a price history survives the spelling.
      </Caption>

      <p className="mt-5 text-sm font-medium">Microgreens, per kg</p>
      <div className="mt-3">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-32 w-full" role="img" aria-label="Unit price rising from ₹212 in April to ₹249 in September">
          {/* Revealed by a clip rather than a dash offset. The stroke does not
              scale with the stretched viewBox, so a dash pattern measured in
              user units draws the line as a row of gaps. */}
          <g className="motion-safe:animate-[reveal_1.4s_ease-out_forwards]">
            <path
              d={path}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </svg>
        <div className="text-muted-foreground mt-1 flex justify-between text-xs">
          {points.map((p) => (
            <span key={p.date}>{p.date}</span>
          ))}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <Figure label="Now" value="₹249" />
        <Figure label="Since April" value="+17%" />
        <Figure label="Cheapest" value="Gupta Traders" />
      </dl>
    </div>
  );
}

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

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border rounded-lg border p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

"use client";

import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The three questions the product answers, shown as a live-looking result
 * rather than a paragraph each. Switching tabs replays the reveal, so the
 * bars and rows always animate in rather than just sitting there static.
 * Every figure is invented, same rule as the rest of the page.
 */

const QUESTIONS = [
  { key: "item", label: "What have I been paying for this?" },
  { key: "vendor", label: "Who am I paying the most?" },
  { key: "mismatch", label: "Which invoices do not add up?" },
] as const;

type QuestionKey = (typeof QUESTIONS)[number]["key"];

export function WhatItAnswers() {
  const [tab, setTab] = useState<QuestionKey>("item");
  // Keying the panel by a run count forces the fade-up/sweep animations to
  // replay on every switch, including re-selecting the tab already showing.
  const [run, setRun] = useState(0);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(value as QuestionKey);
        setRun((n) => n + 1);
      }}
    >
      <TabsList className="h-auto flex-wrap">
        {QUESTIONS.map((q) => (
          <TabsTrigger key={q.key} value={q.key} className="text-xs sm:text-sm">
            {q.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="border-border bg-card mt-4 min-h-[16rem] rounded-xl border p-5 sm:p-6">
        <TabsContent value="item">
          <ItemAnswer key={run} />
        </TabsContent>
        <TabsContent value="vendor">
          <VendorAnswer key={run} />
        </TabsContent>
        <TabsContent value="mismatch">
          <MismatchAnswer key={run} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

/** Every purchase of one thing, across vendors, cheapest one called out. */
function ItemAnswer() {
  const rows = [
    { vendor: "Gupta Traders", price: 212, cheapest: true },
    { vendor: "AMJ Distributors", price: 228 },
    { vendor: "Sri Lakshmi Paper", price: 249 },
  ];
  const max = Math.max(...rows.map((r) => r.price));

  return (
    <div>
      <Caption>A ream of A4, wherever it was bought, at what each vendor actually charged.</Caption>
      <ul className="mt-5 space-y-3">
        {rows.map((r, i) => (
          <li
            key={r.vendor}
            className="motion-safe:animate-[fade-up_0.5s_ease-out_backwards]"
            style={{ animationDelay: `${i * 0.12}s` }}
          >
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {r.vendor}
                {r.cheapest && (
                  <span className="text-primary ml-2 text-xs font-normal">cheapest now</span>
                )}
              </span>
              <span className="tabular-nums">₹{r.price}</span>
            </div>
            <div className="bg-muted mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary motion-safe:animate-[sweep_0.7s_ease-out_backwards] h-full rounded-full"
                style={{ width: `${(r.price / max) * 100}%`, animationDelay: `${0.15 + i * 0.12}s` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every vendor by total spend, ranked. */
function VendorAnswer() {
  const rows = [
    { vendor: "Sri Lakshmi Paper", spend: 84200 },
    { vendor: "AMJ Distributors", spend: 61300 },
    { vendor: "Gupta Traders", spend: 38900 },
  ];
  const max = Math.max(...rows.map((r) => r.spend));

  return (
    <div>
      <Caption>Total spend by vendor, invoices with a mismatch counted once cleared.</Caption>
      <ul className="mt-5 space-y-3">
        {rows.map((r, i) => (
          <li
            key={r.vendor}
            className="motion-safe:animate-[fade-up_0.5s_ease-out_backwards]"
            style={{ animationDelay: `${i * 0.12}s` }}
          >
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{r.vendor}</span>
              <span className="tabular-nums">₹{r.spend.toLocaleString("en-IN")}</span>
            </div>
            <div className="bg-muted mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary motion-safe:animate-[sweep_0.7s_ease-out_backwards] h-full rounded-full"
                style={{ width: `${(r.spend / max) * 100}%`, animationDelay: `${0.15 + i * 0.12}s` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One invoice whose own figures disagree, held out and flagged. */
function MismatchAnswer() {
  return (
    <div>
      <Caption>Anything whose own figures disagree is kept out of the totals and flagged.</Caption>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <dl
          className="border-border motion-safe:animate-[fade-up_0.5s_ease-out_backwards] space-y-2 rounded-lg border p-4 text-sm"
        >
          <Row label="Line items, summed" value="₹3,220.00" />
          <Row label="Subtotal, as printed" value="₹3,220.00" />
          <Row label="Tax" value="₹0.00" />
          <div className="border-border border-t pt-2">
            <Row label="Total, as printed" value="₹3,500.00" off />
          </div>
        </dl>

        <div
          className="border-destructive/40 bg-destructive/5 motion-safe:animate-[fade-up_0.5s_ease-out_0.15s_backwards] rounded-lg border p-4"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlertIcon className="size-4" aria-hidden />
            Does not add up
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            The total is ₹280.00 more than the subtotal plus taxes.
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Held for you to look at, next to the original, rather than folded
            into a spend figure.
          </p>
        </div>
      </div>
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

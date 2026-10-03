"use client";

import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The three questions the product answers, shown as a live-looking result
 * rather than a paragraph each. Switching tabs replays the reveal, so the
 * bars and rows always animate in rather than just sitting there static.
 * Every figure is invented, same rule as the rest of the page.
 *
 * Each label is a question someone would say out loud, and each panel answers
 * that question and not a neighbouring one. The first tab used to ask what
 * something had cost over time and then draw a comparison between vendors,
 * which is a different question, so the two are now separate tabs drawing
 * what they say.
 */

const QUESTIONS = [
  { key: "contract", label: "Am I being charged what we agreed?" },
  { key: "trend", label: "Is this getting more expensive?" },
  { key: "vendor", label: "Who should I buy it from?" },
  { key: "mismatch", label: "Which bills should I not have paid?" },
] as const;

type QuestionKey = (typeof QUESTIONS)[number]["key"];

export function WhatItAnswers() {
  const [tab, setTab] = useState<QuestionKey>("contract");
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
      {/*
        Scrolls sideways rather than wrapping. Three questions this long wrap
        to three stacked rows on a phone, which reads as a broken button group
        rather than as a set of tabs.
      */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList className="w-max">
          {QUESTIONS.map((q) => (
            <TabsTrigger key={q.key} value={q.key} className="text-xs sm:text-sm">
              {q.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="border-border bg-card mt-4 rounded-xl border p-5 sm:p-6">
        <TabsContent value="contract">
          <ContractAnswer key={run} />
        </TabsContent>
        <TabsContent value="trend">
          <TrendAnswer key={run} />
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

/**
 * What a contract says about a line somebody was billed for.
 *
 * First, because it is the thing nothing else in the product does: a price
 * history tells you a price went up, and this tells you it went up past what
 * was agreed, and by how much, and points at the line of the contract that
 * says so.
 */
function ContractAnswer() {
  return (
    <div>
      <Caption>
        One line from an invoice, against the rate the contract sets for it.
      </Caption>

      <div className="mt-5 flex flex-col gap-3">
        <span className="inline-block self-start rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-200">
          billed above contract
        </span>

        <dl className="motion-safe:animate-[fade-up_0.5s_ease-out_backwards] grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <Row label="Billed" value="₹312.00 per ream" />
          <Row label="Contracted" value="₹285.00 per ream" />
          <Row label="Difference" value="₹27.00, over" off />
          <Row label="Quantity" value="1,051 reams" />
        </dl>

        <div
          className="motion-safe:animate-[fade-up_0.5s_ease-out_0.12s_backwards] flex items-baseline justify-between rounded-lg bg-black/5 px-4 py-3 dark:bg-white/10"
        >
          <span className="text-xs uppercase tracking-wide opacity-60">
            Overbilled on this line
          </span>
          <span className="text-2xl font-semibold tabular-nums">₹28,377</span>
        </div>

        <div className="motion-safe:animate-[fade-up_0.5s_ease-out_0.24s_backwards]">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            The rate came from
          </p>
          <p className="mt-1 text-sm font-medium">Rate Contract 2025-26, page 44</p>
          <blockquote className="text-muted-foreground mt-1 border-l-2 border-black/20 pl-3 text-sm dark:border-white/20">
            &ldquo;A4 Paper 80 GSM, white, per ream, Rs. 285.00, firm for the
            contract period&rdquo;
          </blockquote>
        </div>
      </div>
    </div>
  );
}

/**
 * One thing's price as it moved.
 *
 * This was the walkthrough's third panel, which drew the same history a few
 * hundred pixels above this one. It belongs here: a price over time is an
 * answer, not a step in reading a file.
 *
 * A line rather than the bar list the vendor answer uses. Rs212 against Rs249
 * draws as two bars of near enough the same length, so a panel whose point is
 * that the price is climbing would show bars that look alike, and shortening
 * them from a floor other than zero would make the rise look bigger than it
 * is. A line against a fixed scale rises without exaggerating.
 */
function TrendAnswer() {
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
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-32 w-full"
          role="img"
          aria-label="Unit price rising from ₹212 in April to ₹249 in September"
        >
          {/* Revealed by a clip rather than a dash offset. The stroke does not
              scale with the stretched viewBox, so a dash pattern measured in
              user units draws the line as a row of gaps. */}
          <g className="motion-safe:animate-[sweep_1.4s_ease-out_forwards]">
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

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Figure label="Now" value="₹249" />
        <Figure label="Since April" value="+17%" />
        <Figure label="Cheapest" value="Gupta Traders" />
      </dl>
    </div>
  );
}

/** Every vendor's price for the same thing, cheapest called out. */
function VendorAnswer() {
  return (
    <div>
      <Caption>
        What each vendor charges for that same ream, at the last price they
        billed.
      </Caption>
      <Bars
        rows={[
          { label: "Gupta Traders", value: 212, amount: "₹212", note: "cheapest now" },
          { label: "AMJ Distributors", value: 228, amount: "₹228" },
          { label: "Sri Lakshmi Paper", value: 249, amount: "₹249" },
        ]}
      />
    </div>
  );
}

/** One invoice whose own figures disagree, held out and flagged. */
function MismatchAnswer() {
  return (
    <div>
      <Caption>Anything whose own figures disagree is kept out of the totals and flagged.</Caption>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <dl className="border-border motion-safe:animate-[fade-up_0.5s_ease-out_backwards] space-y-2 rounded-lg border p-4 text-sm">
          <Row label="Line items, summed" value="₹3,220.00" />
          <Row label="Subtotal, as printed" value="₹3,220.00" />
          <Row label="Tax" value="₹0.00" />
          <div className="border-border border-t pt-2">
            <Row label="Total, as printed" value="₹3,500.00" off />
          </div>
        </dl>

        <div className="border-destructive/40 bg-destructive/5 motion-safe:animate-[fade-up_0.5s_ease-out_0.15s_backwards] rounded-lg border p-4">
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

type Bar = { label: string; value: number; amount: string; note?: string };

/**
 * The labelled bar list both price answers draw. One component rather than
 * two copies, since the only difference between them was what the rows are
 * keyed by: months in one, vendors in the other.
 */
function Bars({ rows }: { rows: Bar[] }) {
  const max = Math.max(...rows.map((r) => r.value));

  return (
    <ul className="mt-5 space-y-3">
      {rows.map((r, i) => (
        <li
          key={r.label}
          className="motion-safe:animate-[fade-up_0.5s_ease-out_backwards]"
          style={{ animationDelay: `${i * 0.12}s` }}
        >
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">
              {r.label}
              {r.note && (
                <span className="text-primary ml-2 text-xs font-normal">{r.note}</span>
              )}
            </span>
            <span className="tabular-nums">{r.amount}</span>
          </div>
          <div className="bg-muted mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary motion-safe:animate-[sweep_0.7s_ease-out_backwards] h-full rounded-full"
              style={{
                width: `${(r.value / max) * 100}%`,
                animationDelay: `${0.15 + i * 0.12}s`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">{children}</p>;
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border rounded-lg border p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Row({ label, value, off = false }: { label: string; value: string; off?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${off ? "text-destructive font-medium" : ""}`}>{value}</dd>
    </div>
  );
}

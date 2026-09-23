"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { money } from "@/lib/format.ts";
import type { ExtractedInvoice } from "@/lib/extract/schema.ts";
import { confirmDraft, discardDraft, type SaveResult } from "./actions.ts";
import { capture } from "../../analytics-provider.tsx";

type Props = {
  draftId: string;
  initial: ExtractedInvoice;
  /** The sums that do not add up. */
  problems: string[];
  /** Not about the sums: a possible non invoice, a copy, or one already saved. */
  warnings: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function ReviewForm({ draftId, initial, problems, warnings }: Props) {
  const [invoice, setInvoice] = useState<ExtractedInvoice>(initial);
  const [saved, save, saving] = useActionState<SaveResult, FormData>(confirmDraft, null);
  const [, discard] = useActionState<SaveResult, FormData>(discardDraft, null);

  function field<K extends keyof ExtractedInvoice>(key: K, value: ExtractedInvoice[K]) {
    setInvoice((current) => ({ ...current, [key]: value }));
  }

  function line(index: number, patch: Partial<ExtractedInvoice["line_items"][number]>) {
    setInvoice((current) => ({
      ...current,
      line_items: current.line_items.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    }));
  }

  // Recomputed as you type, so a correction shows its effect immediately
  // instead of only when you try to save.
  const lineTotal = round2(invoice.line_items.reduce((sum, l) => sum + (l.amount || 0), 0));
  const withTaxes = round2(
    invoice.subtotal + invoice.cgst + invoice.sgst + invoice.igst,
  );
  const subtotalOff = round2(Math.abs(lineTotal - invoice.subtotal)) > 1;
  const totalOff = round2(Math.abs(withTaxes - invoice.total)) > 1;

  return (
    <div className="space-y-6">
      {warnings.length > 0 && (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Check this before saving</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p>
              Check the original. If this should not be saved, discard it. If
              it should, correct the invoice number or total below.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {problems.length > 0 && (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>These figures do not add up</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p>
              Correct them against the original, or save anyway and it is kept
              flagged for checking.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Text label="Vendor" value={invoice.vendor_name} onChange={(v) => field("vendor_name", v)} />
        <Text
          label="GSTIN"
          value={invoice.gstin ?? ""}
          mono
          onChange={(v) => field("gstin", v ? v.toUpperCase() : null)}
        />
        <Text
          label="Invoice number"
          value={invoice.invoice_number}
          mono
          onChange={(v) => field("invoice_number", v)}
        />
        <Text
          label="Date"
          type="date"
          value={invoice.invoice_date}
          onChange={(v) => field("invoice_date", v)}
        />
      </div>

      <Separator />

      <div>
        <h2 className="text-sm font-medium">Line items</h2>
        <div className="mt-3 space-y-3">
          {invoice.line_items.map((item, index) => (
            <div key={index} className="border-border grid gap-2 rounded-lg border p-3 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <Text
                  label="Description"
                  value={item.description}
                  onChange={(v) => line(index, { description: v })}
                />
              </div>
              <div className="sm:col-span-2">
                <NumberField label="Qty" value={item.quantity} onChange={(v) => line(index, { quantity: v })} />
              </div>
              <div className="sm:col-span-2">
                <NumberField
                  label="Unit price"
                  value={item.unit_price}
                  onChange={(v) => line(index, { unit_price: v })}
                />
              </div>
              <div className="sm:col-span-3">
                <NumberField label="Amount" value={item.amount} onChange={(v) => line(index, { amount: v })} />
              </div>
            </div>
          ))}
        </div>
        <p className={`mt-2 text-xs ${subtotalOff ? "text-destructive" : "text-muted-foreground"}`}>
          Line items add up to {money(lineTotal)}.
        </p>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField label="Subtotal" value={invoice.subtotal} onChange={(v) => field("subtotal", v)} invalid={subtotalOff} />
        <NumberField label="CGST" value={invoice.cgst} onChange={(v) => field("cgst", v)} />
        <NumberField label="SGST" value={invoice.sgst} onChange={(v) => field("sgst", v)} />
        <NumberField label="IGST" value={invoice.igst} onChange={(v) => field("igst", v)} />
        <NumberField label="Total" value={invoice.total} onChange={(v) => field("total", v)} invalid={totalOff} />
        <div className="self-end">
          <p className={`text-xs ${totalOff ? "text-destructive" : "text-muted-foreground"}`}>
            Subtotal plus taxes is {money(withTaxes)}.
          </p>
        </div>
      </div>

      {saved && !saved.ok && (
        <p role="alert" className="text-destructive text-sm">
          {saved.message}{" "}
          {saved.duplicateId && (
            <Link href={`/vendors`} className="underline">
              See the one already stored
            </Link>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <form action={save}>
          <input type="hidden" name="draftId" value={draftId} />
          <input type="hidden" name="invoice" value={JSON.stringify(invoice)} />
          <Button
            type="submit"
            disabled={saving}
            onClick={() =>
              capture("invoice_saved", {
                line_items: invoice.line_items.length,
                flagged: subtotalOff || totalOff,
                warnings: warnings.length,
              })
            }
          >
            {saving ? "Saving…" : subtotalOff || totalOff ? "Save and flag for checking" : "Confirm and save"}
          </Button>
        </form>
        <form action={discard}>
          <input type="hidden" name="draftId" value={draftId} />
          <Button type="submit" variant="ghost" onClick={() => capture("draft_discarded", { warnings: warnings.length })}>
            Discard
          </Button>
        </form>
      </div>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  type = "text",
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  mono?: boolean;
}) {
  const id = `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        className={mono ? "font-mono" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  invalid = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  invalid?: boolean;
}) {
  const id = `n-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        step="0.01"
        inputMode="decimal"
        value={value}
        aria-invalid={invalid || undefined}
        className="tabular-nums"
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      />
    </div>
  );
}

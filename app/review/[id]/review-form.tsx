"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { money } from "@/lib/format.ts";
import type { ExtractedInvoice, ExtractedTax } from "@/lib/extract/schema.ts";
import { confirmDraft, discardDraft, type SaveResult } from "./actions.ts";
import { intentOf } from "@/lib/review-keys.ts";

type Props = {
  draftId: string;
  initial: ExtractedInvoice;
  /** The sums that do not add up. */
  problems: string[];
  /** Not about the sums: a possible non invoice, a copy, or one already saved. */
  warnings: string[];
  /** The next draft from the same file, for moving through a batch. */
  nextHref: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function ReviewForm({ draftId, initial, problems, warnings, nextHref }: Props) {
  const [invoice, setInvoice] = useState<ExtractedInvoice>(initial);
  const [saved, save, saving] = useActionState<SaveResult, FormData>(confirmDraft, null);
  const [, discard] = useActionState<SaveResult, FormData>(discardDraft, null);
  const router = useRouter();
  const saveForm = useRef<HTMLFormElement>(null);

  function field<K extends keyof ExtractedInvoice>(key: K, value: ExtractedInvoice[K]) {
    setInvoice((current) => ({ ...current, [key]: value }));
  }

  function line(index: number, patch: Partial<ExtractedInvoice["line_items"][number]>) {
    setInvoice((current) => ({
      ...current,
      line_items: current.line_items.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    }));
  }

  function tax(index: number, patch: Partial<ExtractedTax>) {
    setInvoice((current) => ({
      ...current,
      taxes: current.taxes.map((entry, taxIndex) =>
        taxIndex === index ? { ...entry, ...patch } : entry,
      ),
    }));
  }

  // Recomputed as you type, so a correction shows its effect immediately
  // instead of only when you try to save.
  const lineTotal = round2(invoice.line_items.reduce((sum, line) => sum + (line.amount || 0), 0));
  const chargedTax = invoice.taxes
    .filter((entry) => !entry.included)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const withTaxes = round2(invoice.subtotal + chargedTax);
  const subtotalOff = round2(Math.abs(lineTotal - invoice.subtotal)) > 1;
  const totalOff = round2(Math.abs(withTaxes - invoice.total)) > 1;
  const addsUp = !subtotalOff && !totalOff;

  /**
   * Reviewing twenty invoices by mouse is slow in a way one invoice never
   * shows. Enter saves when the figures add up, since that is the answer for
   * most of them; when they do not, Enter does nothing, because saving a
   * flagged invoice should be a deliberate act rather than a reflex.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const intent = intentOf(
      {
        key: event.key,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        tagName: (event.target as HTMLElement).tagName,
        isComposing: event.nativeEvent.isComposing,
      },
      { addsUp, saving, hasNext: nextHref !== null },
    );

    if (intent === "save") {
      event.preventDefault();
      saveForm.current?.requestSubmit();
    } else if (intent === "next" && nextHref) {
      event.preventDefault();
      router.push(nextHref);
    }
  }

  return (
    // Listening on the container rather than on each field: the shortcut
    // belongs to the screen, and every input inside it bubbles here.
    <div className="space-y-6" onKeyDown={onKeyDown}>
      {warnings.length > 0 && (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Check this before saving</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-5">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
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
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
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
        {/* Focus starts on the first field, so a keyboard review begins by
            reading rather than by hunting for a way in. */}
        <Text
          label="Vendor"
          value={invoice.vendor_name}
          onChange={(value) => field("vendor_name", value)}
          autoFocus
        />
        <Text
          label="Vendor tax number"
          value={invoice.tax_id ?? ""}
          mono
          onChange={(value) => field("tax_id", value ? value.toUpperCase() : null)}
        />
        <Text
          label="Invoice number"
          value={invoice.invoice_number}
          mono
          onChange={(value) => field("invoice_number", value)}
        />
        <Text
          label="Date"
          type="date"
          value={invoice.invoice_date}
          onChange={(value) => field("invoice_date", value)}
        />
        <div className="space-y-1.5">
          <Label htmlFor="currency" className="text-xs">Currency</Label>
          <select
            id="currency"
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={invoice.currency}
            onChange={(event) =>
              field("currency", event.target.value as ExtractedInvoice["currency"])
            }
          >
            <option value="INR">INR, Indian rupees</option>
            <option value="USD">USD, US dollars</option>
            <option value="EUR">EUR, euros</option>
          </select>
        </div>
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
                  onChange={(value) => line(index, { description: value })}
                />
              </div>
              <div className="sm:col-span-2">
                <NumberField
                  label="Qty"
                  value={item.quantity}
                  onChange={(value) => line(index, { quantity: value ?? 0 })}
                />
              </div>
              <div className="sm:col-span-2">
                <NumberField
                  label="Unit price"
                  value={item.unit_price}
                  onChange={(value) => line(index, { unit_price: value ?? 0 })}
                />
              </div>
              <div className="sm:col-span-3">
                <NumberField
                  label="Amount"
                  value={item.amount}
                  onChange={(value) => line(index, { amount: value ?? 0 })}
                />
              </div>
            </div>
          ))}
        </div>
        <p className={`mt-2 text-xs ${subtotalOff ? "text-destructive" : "text-muted-foreground"}`}>
          Line items add up to {money(lineTotal, invoice.currency)}.
        </p>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium">Taxes</h2>
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={invoice.taxes_read}
              onChange={(event) => {
                field("taxes_read", event.target.checked);
                if (!event.target.checked) field("taxes", []);
              }}
            />
            Tax area was readable
          </label>
        </div>
        {!invoice.taxes_read && (
          <p className="text-muted-foreground text-xs">
            The tax area could not be read. No tax line has been inferred.
          </p>
        )}
        {invoice.taxes_read && (
          <>
            {invoice.taxes.map((entry, index) => (
              <div key={index} className="border-border grid gap-2 rounded-lg border p-3 sm:grid-cols-12">
                <div className="sm:col-span-4">
                  <Text
                    label="Tax label"
                    value={entry.label}
                    onChange={(value) => tax(index, { label: value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <NumberField
                    label="Rate"
                    value={entry.rate ?? undefined}
                    onChange={(value) => tax(index, { rate: value ?? null })}
                  />
                </div>
                <div className="sm:col-span-3">
                  <NumberField
                    label="Tax amount"
                    value={entry.amount}
                    onChange={(value) => tax(index, { amount: value ?? 0 })}
                  />
                </div>
                <label className="text-muted-foreground flex items-center gap-2 self-center text-xs sm:col-span-3">
                  <input
                    type="checkbox"
                    checked={entry.included}
                    onChange={(event) => tax(index, { included: event.target.checked })}
                  />
                  Included in prices
                </label>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                field("taxes", [
                  ...invoice.taxes,
                  { label: "Tax", rate: null, amount: 0, included: false },
                ])
              }
            >
              Add tax line
            </Button>
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          label="Subtotal"
          value={invoice.subtotal}
          onChange={(value) => field("subtotal", value ?? 0)}
          invalid={subtotalOff}
        />
        <NumberField
          label="Total"
          value={invoice.total}
          onChange={(value) => field("total", value ?? 0)}
          invalid={totalOff}
        />
        <div className="self-end">
          <p className={`text-xs ${totalOff ? "text-destructive" : "text-muted-foreground"}`}>
            Subtotal plus taxes is {money(withTaxes, invoice.currency)}.
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
        <form action={save} ref={saveForm}>
          <input type="hidden" name="draftId" value={draftId} />
          <input type="hidden" name="invoice" value={JSON.stringify(invoice)} />
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : subtotalOff || totalOff ? "Save and flag for checking" : "Confirm and save"}
          </Button>
        </form>
        <form action={discard}>
          <input type="hidden" name="draftId" value={draftId} />
          <Button type="submit" variant="ghost">
            Discard
          </Button>
        </form>
      </div>

      <p className="text-muted-foreground text-xs">
        {addsUp ? "Enter saves." : "Enter is off while the figures disagree."}
        {nextHref && " Alt and right arrow opens the next invoice from this file."}
      </p>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  type = "text",
  mono = false,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  mono?: boolean;
  autoFocus?: boolean;
}) {
  const id = `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        autoFocus={autoFocus}
        className={mono ? "font-mono" : undefined}
        onChange={(event) => onChange(event.target.value)}
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
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  invalid?: boolean;
}) {
  const id = `n-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input
        id={id}
        type="number"
        step="0.01"
        inputMode="decimal"
        value={value ?? ""}
        aria-invalid={invalid || undefined}
        className="tabular-nums"
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : Number(event.target.value))
        }
      />
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { originalSrc } from "@/lib/original.ts";
import { money } from "@/lib/format.ts";
import { defaultVendorId } from "@/lib/vendors/normalize.ts";
import { amendRate, confirmContract, type ReviewOutcome } from "./review-actions.ts";

type Rate = {
  id: string;
  printed_name: string;
  unit: string | null;
  rate: number;
  currency: "INR" | "USD" | "EUR";
  effective_from: string;
  effective_to: string | null;
  source_page: number | null;
  source_quote: string | null;
  item_id: string | null;
  item_name: string | null;
};

type Props = {
  contractId: string;
  blobUrl: string;
  scanned: boolean;
  vendors: { id: string; name: string }[];
  suggested: { name: string; address: string | null; taxId: string | null; taxIdKind: string | null };
  period: { from: string | null; to: string | null };
  rates: Rate[];
  items: { id: string; name: string }[];
};

/**
 * The contract on the left, what was read out of it on the right.
 *
 * This reverses the decision made for invoices, which was no per-field
 * highlighting. On a one page invoice you can just look. On two hundred pages
 * finding the clause is the entire problem, so clicking a rate moves the
 * document to the page its quote was actually found on.
 *
 * Found, not claimed. A page a model names is a guess; the page a string
 * search located the quote on is a fact, and a jump that lands nowhere costs
 * more trust than no jump at all.
 */
export function ContractReview({
  contractId,
  blobUrl,
  scanned,
  vendors,
  suggested,
  period,
  rates,
  items,
}: Props) {
  const [page, setPage] = useState<number | null>(null);
  const [confirmed, confirm, confirming] = useActionState<ReviewOutcome, FormData>(
    confirmContract,
    null,
  );

  // Only these need a decision. The rates themselves are shown as a table to
  // scan rather than forty things to click Accept on: a rate that is out by a
  // factor of ten looks wrong sitting next to its neighbours, and forty modals
  // produce the appearance of review and none of the substance.
  const unmatched = rates.filter((rate) => !rate.item_id).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <div className="lg:sticky lg:top-4 lg:self-start">
        <iframe
          key={page ?? "first"}
          src={`${originalSrc(blobUrl)}${page ? `#page=${page}` : ""}`}
          title="The contract"
          className="h-[70vh] w-full rounded-lg border border-black/10 dark:border-white/15"
        />
        {scanned && (
          <p className="text-muted-foreground mt-2 text-xs">
            This is a scan with no text in it, so nothing can be located on a
            page. The rates below have no page to jump to.
          </p>
        )}
      </div>

      <div>
        <form action={confirm} className="flex flex-col gap-4">
          <input type="hidden" name="contractId" value={contractId} />

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Who is this with?</legend>
            <p className="text-muted-foreground text-sm">
              A contract attached to the wrong supplier flags invoices from
              someone who never signed it, and every rate still looks right, so
              nothing downstream would catch it.
            </p>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendorId" className="text-xs font-normal">
                Supplier
              </Label>
              <select
                id="vendorId"
                name="vendorId"
                defaultValue={defaultVendorId(vendors, suggested.name)}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
                <option value="new">
                  New supplier: {suggested.name}
                </option>
              </select>
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer text-xs underline underline-offset-4">
                Details for a new supplier
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                <Field name="vendorName" label="Name" defaultValue={suggested.name} />
                <Field
                  name="vendorAddress"
                  label="Address"
                  defaultValue={suggested.address ?? ""}
                />
                <Field name="taxId" label="Tax number" defaultValue={suggested.taxId ?? ""} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="taxIdKind" className="text-xs font-normal">
                    Which kind
                  </Label>
                  <select
                    id="taxIdKind"
                    name="taxIdKind"
                    defaultValue={suggested.taxIdKind ?? ""}
                    className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                  >
                    <option value="">None printed</option>
                    <option value="gstin">GSTIN</option>
                    <option value="vat">VAT number</option>
                    <option value="ein">EIN</option>
                  </select>
                </div>
              </div>
            </details>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">What period does it cover?</legend>
            <p className="text-muted-foreground text-sm">
              Without a start date nothing can be checked against it, because
              every check asks what was in force on an invoice date.
            </p>
            <div className="flex gap-3">
              <Field
                name="effectiveFrom"
                label="From"
                type="date"
                defaultValue={period.from ?? ""}
              />
              <Field name="effectiveTo" label="Until" type="date" defaultValue={period.to ?? ""} />
            </div>
          </fieldset>

          <div className="border-border rounded-lg border p-4">
            <p className="text-sm">
              {rates.length} {rates.length === 1 ? "rate" : "rates"}
              {unmatched > 0 && `, ${unmatched} not yet matched to an item`}.
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              An unmatched rate is kept and simply never looked up, the same as
              an unmatched invoice line. Nothing here counts until you confirm.
            </p>
            <Button type="submit" className="mt-3" disabled={confirming}>
              {confirming ? "Confirming…" : "Confirm this contract"}
            </Button>
            {confirmed && (
              <p role="alert" className="text-destructive mt-2 text-sm">
                {confirmed.message}
              </p>
            )}
          </div>
        </form>

        <section className="mt-8">
          <h2 className="text-sm font-medium">The rates as read</h2>
          <ul className="mt-3 divide-y divide-black/10 dark:divide-white/15">
            {rates.map((rate) => (
              <RateRow
                key={rate.id}
                contractId={contractId}
                rate={rate}
                items={items}
                onJump={() => rate.source_page && setPage(rate.source_page)}
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function RateRow({
  contractId,
  rate,
  items,
  onJump,
}: {
  contractId: string;
  rate: Rate;
  items: { id: string; name: string }[];
  onJump: () => void;
}) {
  const [problem, amend, saving] = useActionState<ReviewOutcome, FormData>(amendRate, null);

  return (
    <li className="py-3">
      <form action={amend} className="flex flex-col gap-2">
        <input type="hidden" name="contractId" value={contractId} />
        <input type="hidden" name="rateId" value={rate.id} />

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">{rate.printed_name}</span>
          {rate.source_page ? (
            <button
              type="button"
              onClick={onJump}
              className="text-xs underline underline-offset-4"
            >
              page {rate.source_page}
            </button>
          ) : (
            <span className="text-muted-foreground text-xs" title="The quote behind this rate could not be found in the document, so there is no page to jump to.">
              no page found
            </span>
          )}
        </div>

        {rate.source_quote && (
          <blockquote className="text-muted-foreground border-l-2 border-black/20 pl-3 text-xs dark:border-white/20">
            {rate.source_quote}
          </blockquote>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`rate-${rate.id}`} className="text-xs font-normal">
              Rate
            </Label>
            <Input
              id={`rate-${rate.id}`}
              name="rate"
              defaultValue={rate.rate}
              inputMode="decimal"
              className="w-28"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`unit-${rate.id}`} className="text-xs font-normal">
              Per
            </Label>
            <Input
              id={`unit-${rate.id}`}
              name="unit"
              defaultValue={rate.unit ?? ""}
              className="w-24"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`item-${rate.id}`} className="text-xs font-normal">
              Is this
            </Label>
            <select
              id={`item-${rate.id}`}
              name="itemId"
              defaultValue={rate.item_id ?? "none"}
              className="border-input bg-background h-9 w-56 rounded-md border px-2 text-sm"
            >
              <option value="none">Not matched</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>

        <p className="text-muted-foreground text-xs">
          Currently {money(rate.rate, rate.currency)}
          {rate.unit && ` per ${rate.unit}`}
          {rate.item_name ? `, matched to ${rate.item_name}` : ", not matched to an item"}
        </p>

        {problem && (
          <p role="alert" className="text-destructive text-xs">
            {problem.message}
          </p>
        )}
      </form>
    </li>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name} className="text-xs font-normal">
        {label}
      </Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} />
    </div>
  );
}

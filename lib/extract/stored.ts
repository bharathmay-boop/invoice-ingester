import type { ExtractedInvoice } from "./schema.ts";

/**
 * A draft read back from the database, brought up to the shape the screens
 * expect.
 *
 * A draft is an invoice that was extracted and not yet saved, so one can sit in
 * the table across a schema change and be read by code that never existed when
 * it was written. Two of them did exactly that: drafts from September held
 * `cgst`, `sgst` and `igst` and no `taxes`, and the review screen called
 * `.filter` on a field that was not there and crashed the page.
 *
 * Migrations cannot fix this on their own. The invoice table was migrated
 * because its columns are columns; a draft's extraction is a jsonb blob of
 * whatever the model returned that day, and rewriting those in place would
 * mean a migration that reaches inside a document it does not own.
 *
 * So the upgrade happens on read, where it can be tested, and where it also
 * covers a draft written by a version of the app nobody migrated from.
 */

type OldShape = {
  cgst?: number;
  sgst?: number;
  igst?: number;
  gstin?: string | null;
  hsn_code?: string | null;
  line_items?: { hsn_code?: string | null; item_code?: string | null }[];
};

export function upgradeStoredInvoice(raw: unknown): ExtractedInvoice {
  const invoice = { ...(raw as Record<string, unknown>) } as ExtractedInvoice & OldShape;

  // The three Indian columns become one list, dropping the zeroes, which is
  // exactly what migration 015 did to the saved invoices. A zero was a filled
  // in field rather than a tax that was charged.
  if (!Array.isArray(invoice.taxes)) {
    invoice.taxes = (
      [
        ["CGST", invoice.cgst],
        ["SGST", invoice.sgst],
        ["IGST", invoice.igst],
      ] as const
    )
      .filter(([, amount]) => typeof amount === "number" && amount !== 0)
      .map(([label, amount]) => ({ label, rate: null, amount: amount as number, included: false }));
  }

  // An old draft was read before the field existed, so the tax area was read:
  // the alternative, saying it was not, would hold the invoice for a reason
  // that never happened.
  if (typeof invoice.taxes_read !== "boolean") invoice.taxes_read = true;
  if (!Array.isArray(invoice.adjustments)) invoice.adjustments = [];

  // Every draft written before the currency column was Indian, because the app
  // could not read anything else. Same reasoning as migration 014's default:
  // this is a backfill of a known past, not a guess about an unknown present.
  if (!invoice.currency) invoice.currency = "INR";

  if (invoice.tax_id === undefined) {
    invoice.tax_id = invoice.gstin ?? null;
    invoice.tax_id_kind = invoice.gstin ? "gstin" : null;
  }
  if (invoice.vendor_address === undefined) invoice.vendor_address = null;

  if (Array.isArray(invoice.line_items)) {
    invoice.line_items = invoice.line_items.map((line) => {
      const old = line as typeof line & { hsn_code?: string | null };
      return old.item_code !== undefined
        ? line
        : { ...line, item_code: old.hsn_code ?? null };
    });
  }

  return invoice;
}

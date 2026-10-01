// The one shape both providers return. Written before either of them, so they
// are built against this rather than the other way round.
import { z } from "zod";

import type { Currency } from "@/lib/format.ts";

// Bounds match the database columns, so an absurd figure fails here with a
// readable error instead of at save time, or worse, sailing through the
// arithmetic checks as Infinity. numeric(14,2) holds twelve digits before the
// decimal point; the other two follow their own columns.
const MAX_AMOUNT = 999_999_999_999.99; // numeric(14,2)
const MAX_UNIT_PRICE = 9_999_999_999.9999; // numeric(14,4)
const MAX_QUANTITY = 999_999_999.999; // numeric(12,3)

const amount = z.number().finite().nonnegative().max(MAX_AMOUNT);

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.enum(["INR", "USD", "EUR"] satisfies [Currency, ...Currency[]]));

/**
 * A rate as printed, which is not always a number. An invoice that writes
 * "10%" in the rate column cost a whole extraction when this was `z.number()`,
 * and the rate is the one field in a tax line that nothing downstream reads:
 * every check in `validateArithmetic` works on amounts. Losing an invoice over
 * decoration is the wrong trade.
 *
 * A string that is plainly a percentage is taken; anything else becomes null
 * rather than a guess, because a rate that had to be interpreted is worth less
 * than knowing there wasn't one.
 */
const rate = z.union([z.number(), z.string()]).nullable();

/**
 * The printed rate reduced to a number, or null when it cannot be read as one.
 *
 * Kept out of the schema as a plain function because the same schema is turned
 * into the JSON Schema the provider is given, and a transform cannot be
 * expressed there. So the schema says what is accepted on the wire and this
 * says what it means.
 */
function readRate(value: number | string | null): number | null {
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const cleaned = value.trim().replace(/%$/, "").trim();
  const parsed = Number(cleaned);
  return cleaned !== "" && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export const lineItemSchema = z.object({
  description: z.string().min(1),
  // Not the HSN pattern this replaced. An HSN code is 4 to 8 digits; a product
  // code on a European invoice is whatever the seller's catalogue uses, and
  // "W537" is a perfectly ordinary one.
  item_code: z.string().min(1).max(40).nullable(),
  quantity: z.number().finite().positive().max(MAX_QUANTITY),
  unit: z.string().min(1).nullable(),
  unit_price: z.number().finite().nonnegative().max(MAX_UNIT_PRICE),
  amount,
});

export const taxSchema = z.object({
  label: z.string().min(1),
  rate,
  amount,
  included: z.boolean(),
});

export const taxIdKindSchema = z.enum(["gstin", "vat", "ein"]);

export const extractedInvoiceSchema = z
  .object({
    vendor_name: z.string().min(1),
    vendor_address: z.string().min(1).nullable(),
    // Non empty is not enough. Identity is compared on the normalised form,
    // which strips everything that is not a letter or a digit, so "---" is a
    // tax number that normalises to "" and every vendor whose number does that
    // collapses into one. A number with nothing in it is no number.
    tax_id: z
      .string()
      .min(1)
      .refine((value) => /[A-Za-z0-9]/.test(value), "a tax number needs a letter or a digit")
      .nullable(),
    tax_id_kind: taxIdKindSchema.nullable(),
    invoice_number: z.string().min(1),
    invoice_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
      .refine((d) => !Number.isNaN(Date.parse(d)), "not a real date"),
    currency,
    line_items: z.array(lineItemSchema).min(1),
    subtotal: amount,
    taxes: z.array(taxSchema),
    taxes_read: z.boolean(),
    total: amount,
  })
  .refine(
    (invoice) => (invoice.tax_id === null) === (invoice.tax_id_kind === null),
    {
      message: "tax_id and tax_id_kind must either both be present or both be null",
      path: ["tax_id"],
    },
  )
  .refine((invoice) => invoice.taxes_read || invoice.taxes.length === 0, {
    message: "taxes must be empty when the tax area could not be read",
    path: ["taxes"],
  });

export type ExtractedLineItem = z.infer<typeof lineItemSchema>;
export type TaxIdKind = z.infer<typeof taxIdKindSchema>;

/**
 * What the wire allows, and then what the rest of the app gets.
 *
 * They differ in one field. A rate arrives as whatever was printed, including
 * text, because refusing it loses a whole invoice over decoration. Everything
 * past `settleTaxes` sees a number or nothing, so no screen has to wonder
 * whether a rate is "10%" or 10.
 */
type WireTax = z.infer<typeof taxSchema>;
type WireInvoice = z.infer<typeof extractedInvoiceSchema>;

export type ExtractedTax = Omit<WireTax, "rate"> & { rate: number | null };
export type ExtractedInvoice = Omit<WireInvoice, "taxes"> & { taxes: ExtractedTax[] };

export type ParseResult =
  | { ok: true; data: ExtractedInvoice }
  | { ok: false; error: string };

/** The single gate every provider response passes through. */
export function parseExtraction(raw: unknown): ParseResult {
  const result = extractedInvoiceSchema.safeParse(raw);
  if (!result.success) return { ok: false, error: z.prettifyError(result.error) };
  return { ok: true, data: settleTaxes(result.data) };
}

/**
 * What the taxes mean, once the schema has said they are the right shape.
 *
 * A zero amount row is a printing convention rather than a tax that was
 * charged: Indian invoices routinely show "IGST 0.00" beside a filled in CGST
 * and SGST, and carrying it through puts a tax nobody paid on a review screen.
 * Migration 015 made the same call about the old columns, so dropping it here
 * keeps new rows looking like the backfilled ones.
 */
function settleTaxes(invoice: WireInvoice): ExtractedInvoice {
  return {
    ...invoice,
    taxes: invoice.taxes
      .filter((tax) => tax.amount !== 0)
      .map((tax) => ({ ...tax, rate: readRate(tax.rate) })),
  };
}

/**
 * One invoice as found in the file, with the pages it came from, so the review
 * screen can open the original where that invoice starts. Pages are 1 based;
 * an image is page 1.
 */
export const foundInvoiceSchema = z.object({
  first_page: z.number().int().min(1),
  last_page: z.number().int().min(1),
  invoice: extractedInvoiceSchema,
});

export type FoundInvoice = Omit<z.infer<typeof foundInvoiceSchema>, "invoice"> & {
  invoice: ExtractedInvoice;
};

/**
 * What a provider actually returns: a verdict on whether the file holds any
 * invoice at all, then every invoice in it. Without the way out, a photo of a
 * chocolate box has no valid answer except an invented invoice. Without the
 * list, a PDF of three invoices comes back as the first one.
 *
 * `reason` comes first so the model says what the file is before committing to
 * the verdict.
 */
export const extractionResponseSchema = z.object({
  reason: z.string().min(1),
  is_invoice: z.boolean(),
  invoices: z.array(foundInvoiceSchema),
});

export type ResponseResult =
  | { ok: true; invoices: FoundInvoice[] }
  | { ok: false; notInvoice: true; reason: string }
  | { ok: false; notInvoice?: false; error: string };

/**
 * The one gate both providers' responses pass through. `pages` is the length
 * of the file that was read, 1 for an image.
 */
export function parseResponse(raw: unknown, pages: number): ResponseResult {
  const result = extractionResponseSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: `The extracted fields did not validate.\n${z.prettifyError(result.error)}`,
    };
  }
  const { is_invoice, reason } = result.data;
  // Settled here rather than only in `parseExtraction`, because this is the
  // function both providers call. Normalising in the one the tests use and not
  // the one production uses is how a fix ships without shipping.
  const invoices: FoundInvoice[] = result.data.invoices.map((found) => ({
    ...found,
    invoice: settleTaxes(found.invoice),
  }));
  // The verdict wins over whatever was filled in beside it: a "no" with an
  // invoice attached is still a no.
  if (!is_invoice) return { ok: false, notInvoice: true, reason };
  if (!invoices.length) {
    return { ok: false, error: "The model said this is an invoice but returned no fields." };
  }
  // Checked against the file itself: a range outside it would open the
  // original at the wrong place, and says the model lost track of the file.
  // Overlaps are allowed, since one page can hold two small receipts.
  for (const f of invoices) {
    if (f.last_page < f.first_page) {
      return {
        ok: false,
        error: `Invoice ${f.invoice.invoice_number} ends on page ${f.last_page}, before it starts.`,
      };
    }
    if (f.last_page > pages) {
      return {
        ok: false,
        error: `Invoice ${f.invoice.invoice_number} was placed on page ${f.last_page}, but the file has ${pages === 1 ? "one page" : `${pages} pages`}.`,
      };
    }
  }
  return { ok: true, invoices };
}

/**
 * JSON Schema handed to the providers: Anthropic as a strict tool input schema,
 * OpenRouter as a `json_schema` response format. Generated from the zod schema
 * so the two can never drift apart.
 */
export const extractionJsonSchema = z.toJSONSchema(extractionResponseSchema, {
  target: "draft-7",
});

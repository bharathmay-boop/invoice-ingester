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

export const lineItemSchema = z.object({
  description: z.string().min(1),
  item_code: z.string().regex(/^\d{4,8}$/).nullable(),
  quantity: z.number().finite().positive().max(MAX_QUANTITY),
  unit: z.string().min(1).nullable(),
  unit_price: z.number().finite().nonnegative().max(MAX_UNIT_PRICE),
  amount,
});

export const taxSchema = z.object({
  label: z.string().min(1),
  rate: z.number().finite().nonnegative().nullable(),
  amount,
  included: z.boolean(),
});

export const extractedInvoiceSchema = z
  .object({
    vendor_name: z.string().min(1),
    tax_id: z.string().min(1).nullable(),
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
  .refine((invoice) => invoice.taxes_read || invoice.taxes.length === 0, {
    message: "taxes must be empty when the tax area could not be read",
    path: ["taxes"],
  });

export type ExtractedInvoice = z.infer<typeof extractedInvoiceSchema>;
export type ExtractedLineItem = z.infer<typeof lineItemSchema>;
export type ExtractedTax = z.infer<typeof taxSchema>;

export type TaxModel = "gst" | "vat" | "us_sales_tax";

/** The tax model is a read of the labels the model actually found. */
export function classifyTaxes(taxes: ExtractedTax[]): TaxModel | null {
  const labels = taxes.map((tax) => tax.label.toUpperCase());
  if (labels.some((label) => label.includes("IGST"))) return "gst";
  if (labels.some((label) => label.includes("CGST") || label.includes("SGST"))) return "gst";
  if (labels.some((label) => label.includes("VAT"))) return "vat";
  if (labels.some((label) => label.includes("SALES TAX"))) return "us_sales_tax";
  return null;
}

export type ParseResult =
  | { ok: true; data: ExtractedInvoice }
  | { ok: false; error: string };

/** The single gate every provider response passes through. */
export function parseExtraction(raw: unknown): ParseResult {
  const result = extractedInvoiceSchema.safeParse(raw);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, error: z.prettifyError(result.error) };
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

export type FoundInvoice = z.infer<typeof foundInvoiceSchema>;

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
  const { is_invoice, reason, invoices } = result.data;
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

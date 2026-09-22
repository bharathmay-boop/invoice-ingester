// The one shape both providers return. Written before either of them, so they
// are built against this rather than the other way round.
import { z } from "zod";

// 15 characters: state code, PAN, entity number, 'Z', checksum character.
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// Bounds match the database columns, so an absurd figure fails here with a
// readable error instead of at save time, or worse, sailing through the
// arithmetic checks as Infinity. numeric(14,2) holds twelve digits before the
// decimal point; the other two follow their own columns.
const MAX_AMOUNT = 999_999_999_999.99; // numeric(14,2)
const MAX_UNIT_PRICE = 9_999_999_999.9999; // numeric(14,4)
const MAX_QUANTITY = 999_999_999.999; // numeric(12,3)

const amount = z.number().finite().nonnegative().max(MAX_AMOUNT);

export const lineItemSchema = z.object({
  description: z.string().min(1),
  hsn_code: z.string().regex(/^\d{4,8}$/).nullable(),
  quantity: z.number().finite().positive().max(MAX_QUANTITY),
  unit: z.string().min(1).nullable(),
  unit_price: z.number().finite().nonnegative().max(MAX_UNIT_PRICE),
  amount: amount,
});

export const extractedInvoiceSchema = z.object({
  vendor_name: z.string().min(1),
  gstin: z.string().regex(GSTIN, "not a valid 15 character GSTIN").nullable(),
  invoice_number: z.string().min(1),
  invoice_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
    .refine((d) => !Number.isNaN(Date.parse(d)), "not a real date"),
  line_items: z.array(lineItemSchema).min(1),
  subtotal: amount,
  cgst: amount,
  sgst: amount,
  igst: amount,
  total: amount,
});

export type ExtractedInvoice = z.infer<typeof extractedInvoiceSchema>;
export type ExtractedLineItem = z.infer<typeof lineItemSchema>;

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
 * What a provider actually returns: a verdict on whether the file is an invoice
 * at all, then the invoice if it is. Without the way out, a photo of a
 * chocolate box has no valid answer except an invented invoice.
 *
 * `reason` comes first so the model says what the file is before committing to
 * the verdict.
 */
export const extractionResponseSchema = z.object({
  reason: z.string().min(1),
  is_invoice: z.boolean(),
  invoice: extractedInvoiceSchema.nullable(),
});

export type ResponseResult =
  | { ok: true; invoice: ExtractedInvoice }
  | { ok: false; notInvoice: true; reason: string }
  | { ok: false; notInvoice?: false; error: string };

/** The one gate both providers' responses pass through. */
export function parseResponse(raw: unknown): ResponseResult {
  const result = extractionResponseSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: `The extracted fields did not validate.
${z.prettifyError(result.error)}` };
  }
  const { is_invoice, reason, invoice } = result.data;
  // The verdict wins over whatever was filled in beside it: a "no" with an
  // invoice attached is still a no.
  if (!is_invoice) return { ok: false, notInvoice: true, reason };
  if (!invoice) return { ok: false, error: "The model said this is an invoice but returned no fields." };
  return { ok: true, invoice };
}

/**
 * JSON Schema handed to the providers: Anthropic as a strict tool input schema,
 * OpenRouter as a `json_schema` response format. Generated from the zod schema
 * so the two can never drift apart.
 */
export const extractionJsonSchema = z.toJSONSchema(extractionResponseSchema, {
  target: "draft-7",
});

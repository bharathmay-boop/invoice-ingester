// The one shape both providers return. Written before either of them, so they
// are built against this rather than the other way round.
import { z } from "zod";

// 15 characters: state code, PAN, entity number, 'Z', checksum character.
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const amount = z.number().finite().nonnegative();

export const lineItemSchema = z.object({
  description: z.string().min(1),
  hsn_code: z.string().regex(/^\d{4,8}$/).nullable(),
  quantity: z.number().finite().positive(),
  unit: z.string().min(1).nullable(),
  unit_price: amount,
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
 * JSON Schema handed to the providers: Anthropic as a strict tool input schema,
 * OpenRouter as a `json_schema` response format. Generated from the zod schema
 * so the two can never drift apart.
 */
export const extractionJsonSchema = z.toJSONSchema(extractedInvoiceSchema, {
  target: "draft-7",
});

import { z } from "zod";

import { currencySchema } from "../money/schema.ts";

import { describeUnusable, type Failure } from "../extract/failure.ts";

/**
 * What a contract comes back as.
 *
 * Deliberately not the invoice shape. An invoice is a transaction and a
 * contract is a set of promises about future transactions, and the only part
 * of a contract this version acts on is the rates. Everything else it finds is
 * recorded and shown, never checked.
 */

const MAX_RATE = 9_999_999_999.9999; // numeric(14,4)

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(d)), "not a real date");

/**
 * One agreed rate. Every one carries its own dates, which is what lets an
 * escalation be expanded here rather than interpreted at lookup time: a five
 * percent rise each April is three rate rows with three date ranges, and so is
 * an irregular revision letter. The lookup stays a WHERE clause.
 */
export const contractRateSchema = z.object({
  printed_name: z.string().min(1),
  unit: z.string().min(1).nullable(),
  rate: z.number().finite().nonnegative().max(MAX_RATE),
  // Nullable on the wire because the prompt tells the model to leave it empty
  // for a rate the contract gives no dates of its own, and inherit the
  // contract's. `parseContractResponse` fills it in and drops anything that
  // ends up with no date at all, so nothing downstream sees a rate that is in
  // force either always or never.
  effective_from: date.nullable(),
  effective_to: date.nullable(),
  /** Where it was read from, so a figure can be pointed at rather than asserted. */
  page: z.number().int().min(1).nullable(),
  quote: z.string().min(1).nullable(),
});

/**
 * A commercial term this version does not check.
 *
 * Slabs need a running total across invoices, a rebate is a period end
 * calculation, and a revenue share depends on a figure the invoice does not
 * contain. None of them can be verified against one invoice, so checking them
 * would mean guessing, and the honest answer is to show what was found and say
 * it is not being checked.
 */
export const otherTermSchema = z.object({
  kind: z.enum([
    "slab",
    "rebate",
    "revenue_share",
    "minimum_guarantee",
    "escalation",
    "other",
  ]),
  label: z.string().min(1),
  summary: z.string().min(1),
  page: z.number().int().min(1).nullable(),
  quote: z.string().min(1).nullable(),
});

export const contractSchema = z.object({
  vendor_name: z.string().min(1),
  vendor_address: z.string().min(1).nullable(),
  tax_id: z.string().min(1).nullable(),
  tax_id_kind: z.enum(["gstin", "vat", "ein"]).nullable(),
  /**
   * The same schema the invoice reader uses, so `inr` means the same thing
   * on both documents. It did not: the invoice side trimmed and uppercased
   * and this side did not, so a lowercase code read correctly off a
   * contract failed the whole read and left it in `could_not_read`.
   */
  currency: currencySchema,
  /** The contract's own period, which a rate with no dates of its own inherits. */
  effective_from: date.nullable(),
  effective_to: date.nullable(),
  rates: z.array(contractRateSchema),
  other_terms: z.array(otherTermSchema),
});

export const contractResponseSchema = z.object({
  reason: z.string().min(1),
  is_contract: z.boolean(),
  contract: contractSchema.nullable(),
});

type WireRate = z.infer<typeof contractRateSchema>;
export type ContractRate = Omit<WireRate, "effective_from"> & { effective_from: string };
export type OtherTerm = z.infer<typeof otherTermSchema>;
type WireContract = z.infer<typeof contractSchema>;
export type ExtractedContract = Omit<WireContract, "rates"> & { rates: ContractRate[] };

export type ContractParseResult =
  | { ok: true; contract: ExtractedContract; reason: string }
  // Read and declined: this is a purchase order, not a contract. Different
  // from a call that failed, and never worth retrying.
  | { ok: false; notContract: true; reason: string }
  | { ok: false; notContract?: false; failure: Failure };

/**
 * The one gate a contract response passes through.
 *
 * A contract with no rates is a real and correct answer: a services agreement
 * with a revenue share and no rate card is an ordinary document. It becomes a
 * contract with nothing to check rather than a failure.
 */
export function parseContractResponse(raw: unknown): ContractParseResult {
  const result = contractResponseSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, failure: describeUnusable("invalid", z.prettifyError(result.error)) };
  }

  const { is_contract, reason, contract } = result.data;
  if (!is_contract) return { ok: false, notContract: true, reason };
  if (!contract) {
    return { ok: false, failure: describeUnusable("nothing") };
  }

  // A rate with no date of its own takes the contract's. A rate with neither
  // cannot answer "what was in force on this date", so it is dropped rather
  // than stored as a rate that matches everything or nothing.
  const dated: ContractRate[] = contract.rates.flatMap((rate) => {
    const from = rate.effective_from ?? contract.effective_from;
    if (!from) return [];
    return [{ ...rate, effective_from: from, effective_to: rate.effective_to ?? contract.effective_to }];
  });

  return { ok: true, reason, contract: { ...contract, rates: dated } };
}

export const contractJsonSchema = z.toJSONSchema(contractResponseSchema, {
  target: "draft-7",
});

// Two arithmetic checks stand between a model inventing a number and that
// number becoming a spend figure. Nothing else in the system would announce a
// wrong total, so this runs before every save.
//
// See docs/spec.md section 5.
import type { ExtractedInvoice } from "./schema.ts";

export type CheckName = "line_items_sum" | "tax_total";

export type Discrepancy = {
  check: CheckName;
  /** What the invoice claims. */
  stated: number;
  /** What its own figures add up to. */
  computed: number;
  /** Signed, stated minus computed, so the review screen can say which way it is out. */
  difference: number;
};

export type ValidationResult = {
  status: "confirmed" | "needs_review";
  discrepancies: Discrepancy[];
};

export const DEFAULT_TOLERANCE_RUPEES = 1;

// Money arrives as JSON numbers, and adding those directly means 0.1 + 0.2.
// Everything is compared in whole paise instead, which is exact for the two
// decimal places the schema stores.
const toPaise = (rupees: number) => Math.round(rupees * 100);
const toRupees = (paise: number) => paise / 100;

/**
 * `toleranceRupees` comes from settings, since the right slack depends on how
 * the invoices in front of you round their taxes.
 */
export function validateArithmetic(
  invoice: ExtractedInvoice,
  toleranceRupees: number = DEFAULT_TOLERANCE_RUPEES,
): ValidationResult {
  if (!Number.isFinite(toleranceRupees) || toleranceRupees < 0) {
    throw new Error("tolerance must be zero or more rupees");
  }
  const tolerance = toPaise(toleranceRupees);

  const discrepancies: Discrepancy[] = [];

  const check = (name: CheckName, stated: number, computed: number) => {
    const statedPaise = toPaise(stated);
    const difference = statedPaise - computed;
    // At exactly the tolerance the invoice passes. The tolerance is the amount
    // of rounding you are willing to forgive, not the first amount you refuse.
    if (Math.abs(difference) > tolerance) {
      discrepancies.push({
        check: name,
        stated,
        computed: toRupees(computed),
        difference: toRupees(difference),
      });
    }
  };

  const lineTotal = invoice.line_items.reduce(
    (sum, line) => sum + toPaise(line.amount),
    0,
  );
  check("line_items_sum", invoice.subtotal, lineTotal);

  const withTaxes =
    toPaise(invoice.subtotal) +
    toPaise(invoice.cgst) +
    toPaise(invoice.sgst) +
    toPaise(invoice.igst);
  check("tax_total", invoice.total, withTaxes);

  return {
    status: discrepancies.length === 0 ? "confirmed" : "needs_review",
    discrepancies,
  };
}

/** One line per discrepancy, for the review screen and for error messages. */
export function describeDiscrepancy(d: Discrepancy): string {
  const direction = d.difference > 0 ? "more than" : "less than";
  const amount = Math.abs(d.difference).toFixed(2);

  return d.check === "line_items_sum"
    ? `The subtotal is Rs${amount} ${direction} the line items add up to.`
    : `The total is Rs${amount} ${direction} the subtotal plus taxes.`;
}

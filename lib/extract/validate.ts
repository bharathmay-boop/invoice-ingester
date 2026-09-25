// Two arithmetic checks stand between a model inventing a number and that
// number becoming a spend figure. Nothing else in the system would announce a
// wrong total, so this runs before every save.
//
// See docs/spec.md section 5.
import type { ExtractedInvoice } from "./schema.ts";

export type CheckName =
  | "line_items_sum"
  | "tax_total"
  | "zero_total"
  | "placeholder_number"
  | "repeated_in_file"
  | "already_saved";

// What a model writes when it has no invoice number but was made to give one.
const PLACEHOLDER_NUMBER = /^(unknown|n\/?a|none|null|nil|not available|-+|0+|x+)$/i;

export type Discrepancy = {
  check: CheckName;
  /** What the invoice claims. Zero for the checks that are not arithmetic. */
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

/**
 * The widest tolerance worth offering. Not a limit the checks need, but past
 * this the check stops catching anything worth catching, and a setting that
 * quietly disables a safeguard should say so rather than accept the number.
 */
export const MAX_TOLERANCE_RUPEES = 100;

export function checkTolerance(rupees: number): number {
  if (!Number.isFinite(rupees) || rupees < 0) {
    throw new Error("the tolerance must be zero rupees or more");
  }
  if (rupees > MAX_TOLERANCE_RUPEES) {
    throw new Error(
      `over ${MAX_TOLERANCE_RUPEES} rupees the check stops catching anything worth catching`,
    );
  }
  return rupees;
}

// Money arrives as JSON numbers, and adding those directly means 0.1 + 0.2.
// Everything is compared in whole paise instead, which is exact for the two
// decimal places the schema stores.
//
// The safe integer guard is not paranoia. A figure large enough to overflow
// turns into Infinity, two of those subtract to NaN, and `NaN > tolerance` is
// false, so an invoice that adds up to nothing at all would be returned as
// confirmed. The schema bounds amounts to the database columns, but this
// function has to hold on its own since it is the last thing before a save.
function toPaise(rupees: number): number {
  const paise = Math.round(rupees * 100);
  if (!Number.isSafeInteger(paise)) {
    throw new Error(`${rupees} is too large to check arithmetically`);
  }
  return paise;
}

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

  // Both of these add up perfectly and are still not a real invoice. They are
  // the signature of a model that filled the form in for something that was
  // not a bill, which the extraction prompt now lets it refuse, so these only
  // catch the times it says yes anyway.
  if (toPaise(invoice.total) === 0) {
    discrepancies.push(warning("zero_total"));
  }
  if (PLACEHOLDER_NUMBER.test(invoice.invoice_number.trim())) {
    discrepancies.push(warning("placeholder_number"));
  }

  return {
    status: discrepancies.length === 0 ? "confirmed" : "needs_review",
    discrepancies,
  };
}

/**
 * The two checks that add up to the rupee but may not be a real invoice. The
 * review screen shows them apart from the sums, since correcting a figure is
 * the wrong advice for either.
 */
export const isValidityWarning = (d: Discrepancy) => !ARITHMETIC.includes(d.check);

const ARITHMETIC: CheckName[] = ["line_items_sum", "tax_total"];

/** A warning that is not about the figures, recorded with no figures to compare. */
export const warning = (check: CheckName): Discrepancy => ({
  check,
  stated: 0,
  computed: 0,
  difference: 0,
});

/**
 * Which invoices in one file repeat an earlier one: same supplier, same
 * number. The prompt asks for printed copies to be returned once, and this
 * catches the times they are not, so a triplicate does not become three spend
 * entries. The supplier is the GSTIN where there is one, the name otherwise.
 */
export function findRepeats(invoices: ExtractedInvoice[]): Set<number> {
  const seen = new Set<string>();
  const repeats = new Set<number>();
  invoices.forEach((invoice, i) => {
    const supplier = invoice.gstin ?? invoice.vendor_name.trim().toLowerCase();
    const key = JSON.stringify([supplier, invoice.invoice_number.trim().toUpperCase()]);
    if (seen.has(key)) repeats.add(i);
    seen.add(key);
  });
  return repeats;
}

/** One line per discrepancy, for the review screen and for error messages. */
export function describeDiscrepancy(d: Discrepancy): string {
  if (d.check === "zero_total") {
    return "The total is zero.";
  }
  if (d.check === "placeholder_number") {
    return "The invoice number looks like a placeholder, not a real number.";
  }
  if (d.check === "repeated_in_file") {
    return "The same invoice appears earlier in this file, so this may be a printed copy.";
  }
  if (d.check === "already_saved") {
    return "An invoice with this number from this supplier is already saved.";
  }

  const direction = d.difference > 0 ? "more than" : "less than";
  const amount = Math.abs(d.difference).toFixed(2);

  return d.check === "line_items_sum"
    ? `The subtotal is Rs${amount} ${direction} the line items add up to.`
    : `The total is Rs${amount} ${direction} the subtotal plus taxes.`;
}

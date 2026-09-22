// The cheapest defence against a model quietly inventing a number, so it gets
// the tax combinations, both failure modes and the tolerance boundary.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_TOLERANCE_RUPEES,
  describeDiscrepancy,
  validateArithmetic,
} from "../lib/extract/validate.ts";
import type { ExtractedInvoice } from "../lib/extract/schema.ts";

function invoice(over: Partial<ExtractedInvoice> = {}): ExtractedInvoice {
  return {
    vendor_name: "Sharma Stationers",
    gstin: "29ABCDE1234F1Z5",
    invoice_number: "INV-1",
    invoice_date: "2026-04-11",
    line_items: [
      {
        description: "A4 Paper",
        hsn_code: "4802",
        quantity: 10,
        unit: "ream",
        unit_price: 285,
        amount: 2850,
      },
      {
        description: "Stapler",
        hsn_code: "8305",
        quantity: 2,
        unit: "pc",
        amount: 640,
        unit_price: 320,
      },
    ],
    subtotal: 3490,
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: 3490,
    ...over,
  };
}

const checks = (r: ReturnType<typeof validateArithmetic>) =>
  r.discrepancies.map((d) => d.check).sort();

test("every tax combination adds up", () => {
  // No tax.
  assert.equal(validateArithmetic(invoice()).status, "confirmed");

  // Intra state: CGST and SGST at 9% each.
  assert.equal(
    validateArithmetic(
      invoice({ cgst: 314.1, sgst: 314.1, total: 4118.2 }),
    ).status,
    "confirmed",
  );

  // Inter state: IGST at 18%.
  assert.equal(
    validateArithmetic(invoice({ igst: 628.2, total: 4118.2 })).status,
    "confirmed",
  );

  // All three, which is unusual but arithmetically legitimate.
  assert.equal(
    validateArithmetic(
      invoice({ cgst: 100, sgst: 100, igst: 50, total: 3740 }),
    ).status,
    "confirmed",
  );
});

test("a subtotal that disagrees with the line items is caught", () => {
  const result = validateArithmetic(invoice({ subtotal: 3400, total: 3400 }));
  assert.equal(result.status, "needs_review");
  assert.deepEqual(checks(result), ["line_items_sum"]);

  const [d] = result.discrepancies;
  assert.equal(d.stated, 3400);
  assert.equal(d.computed, 3490);
  assert.equal(d.difference, -90);
});

test("a total that disagrees with subtotal plus taxes is caught", () => {
  const result = validateArithmetic(invoice({ cgst: 100, sgst: 100, total: 3000 }));
  assert.equal(result.status, "needs_review");
  assert.deepEqual(checks(result), ["tax_total"]);
  assert.equal(result.discrepancies[0].computed, 3690);
  assert.equal(result.discrepancies[0].difference, -690);
});

test("both failures are reported together, not just the first", () => {
  const result = validateArithmetic(invoice({ subtotal: 3000, total: 9999 }));
  assert.equal(result.status, "needs_review");
  assert.deepEqual(checks(result), ["line_items_sum", "tax_total"]);
});

test("the tolerance boundary forgives rounding and nothing more", () => {
  // Exactly at the tolerance passes: it is the slack you allow, not the first
  // amount you refuse.
  assert.equal(validateArithmetic(invoice({ subtotal: 3491, total: 3491 })).status, "confirmed");
  assert.equal(validateArithmetic(invoice({ subtotal: 3489, total: 3489 })).status, "confirmed");

  // A paise past it does not.
  assert.equal(validateArithmetic(invoice({ subtotal: 3491.01, total: 3491.01 })).status, "needs_review");
  assert.equal(validateArithmetic(invoice({ subtotal: 3488.99, total: 3488.99 })).status, "needs_review");
});

test("the tolerance is configurable", () => {
  const out = invoice({ subtotal: 3495, total: 3495 });
  assert.equal(validateArithmetic(out, 5).status, "confirmed");
  assert.equal(validateArithmetic(out, 4.99).status, "needs_review");

  // Zero tolerance means exact.
  assert.equal(validateArithmetic(invoice(), 0).status, "confirmed");
  assert.equal(validateArithmetic(invoice({ subtotal: 3490.01, total: 3490.01 }), 0).status, "needs_review");

  assert.equal(DEFAULT_TOLERANCE_RUPEES, 1);
});

test("a nonsense tolerance is refused rather than guessed at", () => {
  for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => validateArithmetic(invoice(), bad), /tolerance/);
  }
});

test("paise do not drift when many lines are added", () => {
  // 0.1 + 0.2 territory. Ten lines of 0.1 must come to exactly 1.00.
  const lines = Array.from({ length: 10 }, () => ({
    description: "Rounding bait",
    hsn_code: null,
    quantity: 1,
    unit: null,
    unit_price: 0.1,
    amount: 0.1,
  }));
  const result = validateArithmetic(
    invoice({ line_items: lines, subtotal: 1, total: 1 }),
    0,
  );
  assert.equal(result.status, "confirmed");
});

test("an unrepresentable figure throws rather than passing as confirmed", () => {
  // Without the guard: 1e307 * 100 is Infinity, Infinity minus Infinity is NaN,
  // and NaN > tolerance is false, so this would come back confirmed.
  assert.throws(
    () => validateArithmetic(invoice({ subtotal: 1e307, total: 1e307 })),
    /too large/,
  );
  assert.throws(
    () => validateArithmetic(invoice({ total: Number.MAX_VALUE })),
    /too large/,
  );
});

test("the description says which figure is wrong and by how much", () => {
  const low = validateArithmetic(invoice({ subtotal: 3400, total: 3400 }));
  assert.equal(
    describeDiscrepancy(low.discrepancies[0]),
    "The subtotal is Rs90.00 less than the line items add up to.",
  );

  const high = validateArithmetic(invoice({ cgst: 100, sgst: 100, total: 4000 }));
  assert.equal(
    describeDiscrepancy(high.discrepancies[0]),
    "The total is Rs310.00 more than the subtotal plus taxes.",
  );
});

test("a zero total is flagged even though it adds up", () => {
  const nothing = invoice({
    line_items: [{ ...invoice().line_items[0], unit_price: 0, amount: 0 }],
    subtotal: 0,
    total: 0,
  });
  const result = validateArithmetic(nothing);
  assert.equal(result.status, "needs_review");
  assert.deepEqual(checks(result), ["zero_total"]);
  assert.match(describeDiscrepancy(result.discrepancies[0]), /really an invoice/);
});

test("a placeholder invoice number is flagged", () => {
  for (const number of ["unknown", "N/A", "na", " none ", "---", "000", "XXX"]) {
    const result = validateArithmetic(invoice({ invoice_number: number }));
    assert.deepEqual(checks(result), ["placeholder_number"], number);
  }
  // Real numbers that merely contain those letters pass.
  for (const number of ["INV/26-27/003", "NA-1042", "0012"]) {
    assert.equal(validateArithmetic(invoice({ invoice_number: number })).status, "confirmed", number);
  }
});

// The cheapest defence against a model quietly inventing a number, so it gets
// the tax combinations, both failure modes and the tolerance boundary.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_TOLERANCE_RUPEES,
  checkTolerance,
  describeDiscrepancy,
  findRepeats,
  isValidityWarning,
  validateArithmetic,
} from "../lib/extract/validate.ts";
import type { ExtractedInvoice } from "../lib/extract/schema.ts";

function invoice(over: Partial<ExtractedInvoice> = {}): ExtractedInvoice {
  return {
    vendor_name: "Sharma Stationers",
    vendor_address: "12 Station Road, Bengaluru 560001",
    tax_id: "29ABCDE1234F1Z5",
    tax_id_kind: "gstin",
    invoice_number: "INV-1",
    invoice_date: "2026-04-11",
    currency: "INR",
    line_items: [
      {
        description: "A4 Paper",
        item_code: "4802",
        quantity: 10,
        unit: "ream",
        unit_price: 285,
        amount: 2850,
      },
      {
        description: "Stapler",
        item_code: "8305",
        quantity: 2,
        unit: "pc",
        amount: 640,
        unit_price: 320,
      },
    ],
    subtotal: 3490,
    taxes: [],
    taxes_read: true,
    adjustments: [],
    total: 3490,
    ...over,
  };
}

const checks = (result: ReturnType<typeof validateArithmetic>) =>
  result.discrepancies.map((discrepancy) => discrepancy.check).sort();

test("every tax combination adds up", () => {
  assert.equal(validateArithmetic(invoice()).status, "confirmed");
  assert.equal(
    validateArithmetic(invoice({
      taxes: [
        { label: "CGST", rate: 9, amount: 314.1, included: false },
        { label: "SGST", rate: 9, amount: 314.1, included: false },
      ],
      total: 4118.2,
    })).status,
    "confirmed",
  );
  assert.equal(
    validateArithmetic(invoice({
      taxes: [{ label: "IGST", rate: 18, amount: 628.2, included: false }],
      total: 4118.2,
    })).status,
    "confirmed",
  );
});

test("an included VAT line is already inside the subtotal", () => {
  const result = validateArithmetic(invoice({
    taxes: [{ label: "VAT 10%", rate: 10, amount: 88.92, included: true }],
    total: 3490,
  }));
  assert.equal(result.status, "confirmed");
});

test("a subtotal that disagrees with the line items is caught", () => {
  const result = validateArithmetic(invoice({ subtotal: 3400, total: 3400 }));
  assert.equal(result.status, "needs_review");
  assert.deepEqual(checks(result), ["line_items_sum"]);

  const [discrepancy] = result.discrepancies;
  assert.equal(discrepancy.stated, 3400);
  assert.equal(discrepancy.computed, 3490);
  assert.equal(discrepancy.difference, -90);
});

test("a total that disagrees with subtotal plus taxes is caught", () => {
  const result = validateArithmetic(invoice({
    taxes: [{ label: "VAT", rate: 10, amount: 100, included: false }],
    total: 3000,
  }));
  assert.equal(result.status, "needs_review");
  assert.deepEqual(checks(result), ["tax_total"]);
  assert.equal(result.discrepancies[0].computed, 3590);
  assert.equal(result.discrepancies[0].difference, -590);
});

test("both failures are reported together, not just the first", () => {
  const result = validateArithmetic(invoice({ subtotal: 3000, total: 9999 }));
  assert.equal(result.status, "needs_review");
  assert.deepEqual(checks(result), ["line_items_sum", "tax_total"]);
});

test("the tolerance boundary forgives rounding and nothing more", () => {
  assert.equal(validateArithmetic(invoice({ subtotal: 3491, total: 3491 })).status, "confirmed");
  assert.equal(validateArithmetic(invoice({ subtotal: 3489, total: 3489 })).status, "confirmed");
  assert.equal(validateArithmetic(invoice({ subtotal: 3491.01, total: 3491.01 })).status, "needs_review");
  assert.equal(validateArithmetic(invoice({ subtotal: 3488.99, total: 3488.99 })).status, "needs_review");
});

test("the tolerance is configurable", () => {
  const out = invoice({ subtotal: 3495, total: 3495 });
  assert.equal(validateArithmetic(out, 5).status, "confirmed");
  assert.equal(validateArithmetic(out, 4.99).status, "needs_review");
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
  const lines = Array.from({ length: 10 }, () => ({
    description: "Rounding bait",
    item_code: null,
    quantity: 1,
    unit: null,
    unit_price: 0.1,
    amount: 0.1,
  }));
  const result = validateArithmetic(invoice({ line_items: lines, subtotal: 1, total: 1 }), 0);
  assert.equal(result.status, "confirmed");
});

test("an unrepresentable figure throws rather than passing as confirmed", () => {
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

  const high = validateArithmetic(invoice({
    taxes: [{ label: "VAT", rate: 10, amount: 100, included: false }],
    total: 4000,
  }));
  assert.equal(
    describeDiscrepancy(high.discrepancies[0]),
    "The total is Rs410.00 more than the subtotal plus taxes.",
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
  assert.match(describeDiscrepancy(result.discrepancies[0]), /total is zero/);
  assert.equal(isValidityWarning(result.discrepancies[0]), true);
});

test("a placeholder invoice number is flagged", () => {
  for (const number of ["unknown", "N/A", "na", " none ", "---", "000", "XXX"]) {
    const result = validateArithmetic(invoice({ invoice_number: number }));
    assert.deepEqual(checks(result), ["placeholder_number"], number);
  }
  for (const number of ["INV/26-27/003", "NA-1042", "0012"]) {
    assert.equal(validateArithmetic(invoice({ invoice_number: number })).status, "confirmed", number);
  }
});

test("a printed copy of an invoice in the same file is a repeat", () => {
  const first = invoice();
  const copy = invoice({ invoice_number: " inv-1 " });
  const other = invoice({ invoice_number: "INV-2" });
  const sameNumberOtherSupplier = invoice({ tax_id: "27ABCDE1234F1Z5" });
  assert.deepEqual([...findRepeats([first, other, copy, sameNumberOtherSupplier])], [2]);
});

test("without a vendor tax number the supplier name decides what counts as a repeat", () => {
  const first = invoice({ tax_id: null, tax_id_kind: null, vendor_name: "Sharma Stationers" });
  const copy = invoice({ tax_id: null, tax_id_kind: null, vendor_name: " sharma stationers" });
  const other = invoice({ tax_id: null, tax_id_kind: null, vendor_name: "Gupta Traders" });
  assert.deepEqual([...findRepeats([first, copy, other])], [1]);
});

test("a tolerance has to stay a tolerance", () => {
  for (const good of [0, 0.5, 1, 100]) {
    assert.equal(checkTolerance(good), good);
  }
  for (const bad of [-1, 100.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => checkTolerance(bad), /tolerance|catching/, String(bad));
  }
});

// Three things an audit of the currency branch found missing. Each one is a
// check that exists in the code and had nothing holding it in place.
test("several tax lines at once still add up", () => {
  const result = validateArithmetic(
    invoice({
      line_items: [
        { description: "Paper", item_code: null, quantity: 1, unit: null, unit_price: 10000, amount: 10000 },
      ],
      subtotal: 10000,
      taxes: [
        { label: "CGST", rate: 9, amount: 900, included: false },
        { label: "SGST", rate: 9, amount: 900, included: false },
        { label: "Cess", rate: 1, amount: 100, included: false },
      ],
      total: 11900,
    }),
  );

  assert.equal(result.status, "confirmed");
  assert.equal(result.discrepancies.length, 0);
});

test("an unreadable tax area is held even when the figures happen to agree", () => {
  // The trap this closes: with no tax read, the expected total is the subtotal
  // alone, so an invoice whose printed total equals its subtotal sailed through
  // while the system knew it had not been able to look at the tax.
  const result = validateArithmetic(
    invoice({
      line_items: [
        { description: "Paper", item_code: null, quantity: 1, unit: null, unit_price: 10000, amount: 10000 },
      ],
      subtotal: 10000,
      taxes: [],
      taxes_read: false,
      total: 10000,
    }),
  );

  assert.equal(result.status, "needs_review");
  assert.ok(result.discrepancies.some((d) => d.check === "tax_area_unreadable"));
});

test("repeats in a file are found by the identity the save path uses", () => {
  // The same registration printed two ways is one supplier, so the second copy
  // is a repeat. This used to compare the raw strings and let it through.
  const spaced = invoice({ tax_id: "DE 123 456 789", tax_id_kind: "vat" as const });
  const tight = invoice({ tax_id: "DE123456789", tax_id_kind: "vat" as const });
  assert.deepEqual([...findRepeats([spaced, tight])], [1]);

  // Two businesses sharing a name at different addresses are not one supplier,
  // so neither invoice is a repeat of the other. This used to discard one.
  const here = invoice({ tax_id: null, tax_id_kind: null, vendor_name: "Hopkins and Sons", vendor_address: "12 Mill Road, Leeds" });
  const there = invoice({ tax_id: null, tax_id_kind: null, vendor_name: "Hopkins and Sons", vendor_address: "4 Quay Street, Bristol" });
  assert.deepEqual([...findRepeats([here, there])], []);
});

// A discount, delivery or rounding line moves the total without being tax.
// Before `adjustments` existed there was nowhere to put one, so every invoice
// carrying one was held for a discrepancy nobody could clear, and a check that
// always fires on a legitimate document is one people learn to dismiss.
test("a discount between the subtotal and the total is not a discrepancy", () => {
  const discounted = validateArithmetic(
    invoice({
      line_items: [
        { description: "Paper", item_code: null, quantity: 1, unit: null, unit_price: 438.7, amount: 438.7 },
      ],
      subtotal: 438.7,
      taxes: [],
      adjustments: [{ label: "Discount 2.14%", amount: -9.39 }],
      total: 429.31,
    }),
  );
  assert.equal(discounted.status, "confirmed");

  // Positive too, since delivery is the same shape pointing the other way.
  const delivered = validateArithmetic(
    invoice({
      line_items: [
        { description: "Paper", item_code: null, quantity: 1, unit: null, unit_price: 438.7, amount: 438.7 },
      ],
      subtotal: 438.7,
      taxes: [{ label: "VAT", rate: 10, amount: 43.87, included: false }],
      adjustments: [{ label: "Delivery", amount: 60 }],
      total: 542.57,
    }),
  );
  assert.equal(delivered.status, "confirmed");

  // And an adjustment that does not reconcile is still caught.
  const wrong = validateArithmetic(
    invoice({
      line_items: [
        { description: "Paper", item_code: null, quantity: 1, unit: null, unit_price: 438.7, amount: 438.7 },
      ],
      subtotal: 438.7,
      taxes: [],
      adjustments: [{ label: "Discount", amount: -9.39 }],
      total: 441.14,
    }),
  );
  assert.equal(wrong.status, "needs_review");
  assert.ok(wrong.discrepancies.some((d) => d.check === "tax_total"));
});

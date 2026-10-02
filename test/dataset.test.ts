// The demo dataset is what a logged out visitor sees, and #28 will be checked
// against it, so the numbers are asserted here rather than eyeballed. A change
// to the data that breaks the story it tells should fail loudly.
import assert from "node:assert/strict";
import { test } from "node:test";

import { invoices, items, vendors } from "../lib/demo/dataset.ts";
import { validateArithmetic } from "../lib/extract/validate.ts";
import { normalize } from "../lib/items/normalize.ts";

const round2 = (n: number) => Math.round(n * 100) / 100;

const paperLines = invoices.flatMap((invoice) =>
  invoice.lines
    .filter((line) => line.normalizedName === normalize("A4 Paper 500 Sheets"))
    .map((line) => ({ ...line, invoice })),
);

test("every invoice agrees with the status it claims", () => {
  for (const invoice of invoices) {
    const result = validateArithmetic({
      vendor_name: "",
      vendor_address: null,
      tax_id: invoice.gstin,
      tax_id_kind: "gstin",
      invoice_number: invoice.number,
      invoice_date: invoice.date,
      currency: "INR",
      line_items: invoice.lines.map((line) => ({
        description: line.description,
        item_code: line.itemCode,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unitPrice,
        amount: line.amount,
      })),
      subtotal: invoice.subtotal,
      taxes: invoice.taxes,
      taxes_read: true,
      adjustments: [],
      total: invoice.total,
    });
    assert.equal(result.status, invoice.status, invoice.number);
  }
});

test("exactly one invoice needs review, so that state is visible", () => {
  const needing = invoices.filter((invoice) => invoice.status === "needs_review");
  assert.equal(needing.length, 1);
  assert.equal(needing[0].number, "NS/1207");
});

test("tax follows the vendor's state", () => {
  for (const invoice of invoices) {
    const interState = !invoice.gstin.startsWith("29");
    if (interState) {
      assert.equal(invoice.taxes.length, 1, invoice.number);
      assert.equal(invoice.taxes[0].label, "IGST", invoice.number);
    } else {
      assert.deepEqual(invoice.taxes.map((tax) => tax.label), ["CGST", "SGST"], invoice.number);
    }
  }
});

test("every spelling of the paper lands on one catalogue item", () => {
  const spellings = new Set(paperLines.map((line) => line.description));
  assert.deepEqual(
    [...spellings].sort(),
    ["A4 PAPER (500 sheets)", "A4 Paper 500 Sheets", "Paper, A4, 1 ream"],
  );

  // Three spellings, one item.
  const normalised = new Set(paperLines.map((line) => line.normalizedName));
  assert.equal(normalised.size, 1);
});

test("the paper tells a price story worth looking at", () => {
  // Ten purchases across three of the four vendors, from March to September.
  assert.equal(paperLines.length, 10);
  assert.equal(new Set(paperLines.map((line) => line.invoice.gstin)).size, 3);

  const prices = paperLines.map((line) => line.unitPrice);
  assert.equal(Math.min(...prices), 254);
  assert.equal(Math.max(...prices), 285);

  const dates = paperLines.map((line) => line.invoice.date).sort();
  assert.equal(dates[0], "2026-03-04");
  assert.equal(dates.at(-1), "2026-09-16");

  // Rising over the period, which is what makes the trend line worth drawing.
  const first = paperLines.find((line) => line.invoice.date === "2026-03-04");
  const last = paperLines.find((line) => line.invoice.date === "2026-09-04");
  assert.equal(first?.unitPrice, 262);
  assert.equal(last?.unitPrice, 285);

  // Hand checked: the confirmed spend on paper alone.
  const confirmed = paperLines
    .filter((line) => line.invoice.status === "confirmed")
    .reduce((sum, line) => sum + line.amount, 0);
  assert.equal(round2(confirmed), 59_545);
});

test("the dataset is big enough to be worth browsing", () => {
  assert.equal(vendors.length, 4);
  assert.equal(items.length, 8);
  assert.equal(invoices.length, 13);
  assert.equal(invoices.flatMap((invoice) => invoice.lines).length, 28);

  // Every vendor has more than one invoice, so a vendor page is not one row.
  for (const vendor of vendors) {
    const count = invoices.filter((invoice) => invoice.gstin === vendor.gstin).length;
    assert.ok(count >= 2, `${vendor.name} has ${count} invoices`);
  }

  // Hand checked: total confirmed spend across everything.
  const spend = invoices
    .filter((invoice) => invoice.status === "confirmed")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  assert.equal(round2(spend), 96_780.06);
});

test("invoice numbers are unique per vendor, as the constraint requires", () => {
  const seen = new Set(invoices.map((invoice) => `${invoice.gstin}|${invoice.number}`));
  assert.equal(seen.size, invoices.length);
});

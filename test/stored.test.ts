// A draft is an invoice that was extracted and not yet saved, so one can sit in
// the table across a schema change and be read by code that did not exist when
// it was written. Two did exactly that, and the review screen crashed on every
// one of them.
import assert from "node:assert/strict";
import test from "node:test";

import { upgradeStoredInvoice } from "../lib/extract/stored.ts";

/** Verbatim from a draft stored on 22 September, before any of this existed. */
const september = {
  cgst: 0,
  igst: 0,
  sgst: 0,
  gstin: "29ACEFM3413D1ZJ",
  total: 3220,
  subtotal: 3220,
  line_items: [
    {
      unit: null,
      amount: 3220,
      hsn_code: "0709",
      quantity: 14,
      unit_price: 230,
      description: "Microgreens Harvested",
    },
  ],
  vendor_name: "More Green",
  invoice_date: "2026-05-29",
  invoice_number: "INV/26-27/003",
};

test("a draft written before taxes existed does not crash the screen", () => {
  const upgraded = upgradeStoredInvoice(september);
  // The actual crash: `invoice.taxes.filter` on a field that was not there.
  assert.ok(Array.isArray(upgraded.taxes));
  assert.equal(upgraded.taxes.length, 0, "three zeroes were a filled in field, not a tax charged");
  assert.equal(upgraded.taxes_read, true, "it was read, so holding it for an unread tax area would be a lie");
  assert.deepEqual(upgraded.adjustments, []);
});

test("the old Indian columns become the list migration 015 would have made", () => {
  const upgraded = upgradeStoredInvoice({ ...september, cgst: 289.8, sgst: 289.8, igst: 0 });
  assert.deepEqual(upgraded.taxes, [
    { label: "CGST", rate: null, amount: 289.8, included: false },
    { label: "SGST", rate: null, amount: 289.8, included: false },
  ]);
});

test("a GSTIN becomes a tax number with its kind", () => {
  const upgraded = upgradeStoredInvoice(september);
  assert.equal(upgraded.tax_id, "29ACEFM3413D1ZJ");
  assert.equal(upgraded.tax_id_kind, "gstin");
  assert.equal(upgraded.vendor_address, null);
});

test("an HSN code becomes the generic item code", () => {
  const upgraded = upgradeStoredInvoice(september);
  assert.equal(upgraded.line_items[0].item_code, "0709");
});

test("a draft from before the currency column is rupees, because it could not be anything else", () => {
  // The app could not read another currency then, so this is a backfill of a
  // known past rather than a guess about an unknown present. Same reasoning as
  // migration 014's default.
  assert.equal(upgradeStoredInvoice(september).currency, "INR");
});

test("a draft already in the current shape is left alone", () => {
  const current = {
    ...september,
    currency: "EUR" as const,
    tax_id: "DE123456789",
    tax_id_kind: "vat" as const,
    vendor_address: "Milano",
    taxes: [{ label: "VAT", rate: 10, amount: 88.92, included: false }],
    taxes_read: true,
    adjustments: [{ label: "Delivery", amount: 12 }],
    line_items: [{ ...september.line_items[0], item_code: "W537" }],
  };

  const upgraded = upgradeStoredInvoice(current);
  assert.equal(upgraded.currency, "EUR");
  assert.equal(upgraded.tax_id_kind, "vat");
  assert.deepEqual(upgraded.taxes, current.taxes);
  assert.deepEqual(upgraded.adjustments, current.adjustments);
  assert.equal(upgraded.line_items[0].item_code, "W537");
});

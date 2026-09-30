import assert from "node:assert/strict";
import test from "node:test";

import { money, moneyRounded, unitMoney } from "../lib/format.ts";
import { parseExtraction } from "../lib/extract/schema.ts";

test("money uses the currency and the grouping for that currency", () => {
  assert.equal(money(284600, "INR"), "₹2,84,600.00");
  assert.equal(money(284600, "USD"), "$284,600.00");
  assert.equal(money(284600, "EUR"), "€284,600.00");
});

test("rounded money uses the requested currency", () => {
  assert.equal(moneyRounded(284600, "INR"), "₹2,84,600");
  assert.equal(moneyRounded(284600, "EUR"), "€284,600");
});

test("unit money keeps four decimals and uses the requested symbol", () => {
  assert.equal(unitMoney(0.004, "INR"), "₹0.0040");
  assert.equal(unitMoney(0.004, "USD"), "$0.0040");
  assert.equal(unitMoney(0.004, "EUR"), "€0.0040");
  assert.equal(unitMoney(0.00001, "USD"), "under $0.0001");
  assert.equal(unitMoney(0.00001, "EUR"), "under €0.0001");
});

// Nobody writes a negative price as "₹-0.0030", and pasting a symbol onto an
// already formatted number is how you get one. This is the check that fails if
// the sign drifts back inside the symbol.
test("a negative unit price puts the minus before the symbol", () => {
  assert.equal(unitMoney(-0.003, "INR"), "-₹0.0030");
  assert.equal(unitMoney(-0.003, "USD"), "-$0.0030");
  assert.equal(unitMoney(-0.003, "EUR"), "-€0.0030");
});

test("an invoice without a readable currency is refused", () => {
  const result = parseExtraction({
    vendor_name: "Example Traders",
    gstin: null,
    invoice_number: "INV-1",
    invoice_date: "2026-09-04",
    line_items: [
      {
        description: "Coffee",
        hsn_code: null,
        quantity: 1,
        unit: "kg",
        unit_price: 400,
        amount: 400,
      },
    ],
    subtotal: 400,
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: 400,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /currency/i);
});

test("currency is canonicalized to uppercase before it is accepted", () => {
  const result = parseExtraction({
    vendor_name: "Example Traders",
    gstin: null,
    invoice_number: "INV-2",
    invoice_date: "2026-09-04",
    currency: "eur",
    line_items: [
      {
        description: "Coffee",
        hsn_code: null,
        quantity: 1,
        unit: "kg",
        unit_price: 400,
        amount: 400,
      },
    ],
    subtotal: 400,
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: 400,
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.currency, "EUR");
});

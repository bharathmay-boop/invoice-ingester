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
    tax_id: null,
    tax_id_kind: null,
    vendor_address: null,
    invoice_number: "INV-1",
    invoice_date: "2026-09-04",
    line_items: [
      {
        description: "Coffee",
        item_code: null,
        quantity: 1,
        unit: "kg",
        unit_price: 400,
        amount: 400,
      },
    ],
    subtotal: 400,
    taxes: [],
    taxes_read: true,
    adjustments: [],
    total: 400,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /currency/i);
});

test("currency is canonicalized to uppercase before it is accepted", () => {
  const result = parseExtraction({
    vendor_name: "Example Traders",
    tax_id: null,
    tax_id_kind: null,
    vendor_address: null,
    invoice_number: "INV-2",
    invoice_date: "2026-09-04",
    currency: "eur",
    line_items: [
      {
        description: "Coffee",
        item_code: null,
        quantity: 1,
        unit: "kg",
        unit_price: 400,
        amount: 400,
      },
    ],
    subtotal: 400,
    taxes: [],
    taxes_read: true,
    adjustments: [],
    total: 400,
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.currency, "EUR");
});

// Three things the first real invoice run broke on. Each one lost, or would
// have lost, a whole invoice over a field nothing downstream reads.
test("a rate printed as text is taken rather than throwing the invoice away", () => {
  const base = {
    vendor_name: "Bradley-Andrade",
    tax_id: "985-73-8194",
    tax_id_kind: "ein",
    vendor_address: "9879 Elizabeth Common, Lake Jonathan, RI 12335",
    invoice_number: "97159829",
    invoice_date: "2015-09-18",
    currency: "USD",
    line_items: [
      { description: "Chess table", item_code: "W537", quantity: 2, unit: null, unit_price: 444.6, amount: 889.2 },
    ],
    subtotal: 889.2,
    taxes_read: true,
    adjustments: [],
    total: 978.12,
  };

  const printed = parseExtraction({ ...base, taxes: [{ label: "VAT", rate: "10%", amount: 88.92, included: false }] });
  assert.equal(printed.ok, true);
  if (printed.ok) assert.equal(printed.data.taxes[0].rate, 10);

  // Unreadable becomes null, never a guess, and the amount survives.
  const odd = parseExtraction({ ...base, taxes: [{ label: "VAT", rate: "see note 4", amount: 88.92, included: false }] });
  assert.equal(odd.ok, true);
  if (odd.ok) {
    assert.equal(odd.data.taxes[0].rate, null);
    assert.equal(odd.data.taxes[0].amount, 88.92);
  }
});

test("a tax row charging nothing is not carried through", () => {
  const result = parseExtraction({
    vendor_name: "Krish Cars",
    tax_id: "27AADCK4616L1ZC",
    tax_id_kind: "gstin",
    vendor_address: "Andheri East, Mumbai 400059",
    invoice_number: "HOA/SAVS/21/145",
    invoice_date: "2021-10-16",
    currency: "INR",
    line_items: [
      { description: "Car", item_code: null, quantity: 1, unit: null, unit_price: 971280, amount: 971280 },
    ],
    subtotal: 971280,
    taxes: [
      { label: "CGST", rate: 14, amount: 130186.14, included: false },
      { label: "IGST", rate: 0, amount: 0, included: false },
    ],
    taxes_read: true,
    adjustments: [],
    total: 1101466.14,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.taxes.length, 1);
    assert.equal(result.data.taxes[0].label, "CGST");
  }
});

test("a product code does not have to look like an HSN", () => {
  const result = parseExtraction({
    vendor_name: "Bradley-Andrade",
    tax_id: null,
    tax_id_kind: null,
    vendor_address: null,
    invoice_number: "97159829",
    invoice_date: "2015-09-18",
    currency: "EUR",
    line_items: [
      { description: "Chess table", item_code: "W537", quantity: 1, unit: null, unit_price: 444.6, amount: 444.6 },
    ],
    subtotal: 444.6,
    taxes: [],
    taxes_read: true,
    adjustments: [],
    total: 444.6,
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.line_items[0].item_code, "W537");
});

// A tax number the model returned without saying what kind it is. Refusing the
// pair threw away an otherwise perfect invoice, so a GSTIN, which announces
// itself by shape, is recognised, and anything else loses the number rather
// than being filed under a registration nobody identified.
test("a tax number with no kind is recovered when it is unmistakably a GSTIN", () => {
  const base = {
    vendor_name: "Aditya Birla Sun Life AMC Ltd",
    vendor_address: "One World Center, Mumbai 400013",
    invoice_number: "AMC/2122/FA/0019",
    invoice_date: "2021-09-28",
    currency: "INR",
    line_items: [
      { description: "Sale of old car", item_code: "87032291", quantity: 1, unit: null, unit_price: 252495, amount: 252495 },
    ],
    subtotal: 252495,
    taxes: [{ label: "CGST", rate: 6, amount: 14961, included: false }],
    taxes_read: true,
    adjustments: [],
    total: 267456,
  };

  const gstin = parseExtraction({ ...base, tax_id: "27AAACB6134D1Z4", tax_id_kind: null });
  assert.equal(gstin.ok, true);
  if (gstin.ok) {
    assert.equal(gstin.data.tax_id_kind, "gstin");
    assert.equal(gstin.data.tax_id, "27AAACB6134D1Z4");
  }

  // Not a shape anything can be sure of, so the invoice survives and the vendor
  // falls back to name and address.
  const vague = parseExtraction({ ...base, tax_id: "985-73-8194", tax_id_kind: null });
  assert.equal(vague.ok, true);
  if (vague.ok) {
    assert.equal(vague.data.tax_id, null);
    assert.equal(vague.data.tax_id_kind, null);
  }

  // A kind with no number is still nonsense and still refused.
  assert.equal(parseExtraction({ ...base, tax_id: null, tax_id_kind: "vat" }).ok, false);
});

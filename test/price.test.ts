import assert from "node:assert/strict";
import { test } from "node:test";
import { unitMoney } from "../lib/format.ts";

import { cheapestVendorNow, comparePrices, unitsAreComparable } from "../lib/price.ts";
import type { Currency } from "../lib/format.ts";

const p = (
  vendor: string,
  date: string,
  unit_price: number,
  unit: string | null = "ream",
  currency: Currency = "INR",
) => ({
  vendor_id: vendor,
  vendor_name: vendor,
  invoice_date: date,
  unit_price,
  unit,
  currency,
});

test("cheapest is the lowest current price, not the lowest ever charged", () => {
  const purchases = [
    p("sharma", "2026-04-02", 254),
    p("sharma", "2026-07-19", 268),
    p("acme", "2026-03-04", 262),
    p("acme", "2026-09-04", 285),
    p("nandi", "2026-03-18", 258),
    p("nandi", "2026-08-18", 262),
  ];

  const best = cheapestVendorNow(purchases);
  assert.equal(best?.vendor_id, "nandi");
  assert.equal(best?.unit_price, 262);
});

test("order of the input does not matter", () => {
  const purchases = [
    p("acme", "2026-09-04", 285),
    p("nandi", "2026-08-18", 262),
    p("sharma", "2026-07-19", 268),
  ];
  const forwards = cheapestVendorNow(purchases);
  const backwards = cheapestVendorNow([...purchases].reverse());
  assert.equal(forwards?.vendor_id, backwards?.vendor_id);
  assert.equal(forwards?.vendor_id, "nandi");
});

test("a vendor who has left the picture cannot win on an old price", () => {
  const best = cheapestVendorNow([
    p("gone", "2024-01-01", 10),
    p("gone", "2026-01-01", 900),
    p("current", "2026-09-01", 500),
  ]);
  assert.equal(best?.vendor_id, "current");
});

test("one vendor and one purchase still answer", () => {
  assert.equal(cheapestVendorNow([p("solo", "2026-01-01", 42)])?.unit_price, 42);
  assert.equal(cheapestVendorNow([]), null);
});

test("ties go to whichever is found first, and never to null", () => {
  const best = cheapestVendorNow([p("a", "2026-01-01", 100), p("b", "2026-01-01", 100)]);
  assert.ok(best);
  assert.equal(best.unit_price, 100);
});

test("units decide whether a comparison is allowed at all", () => {
  assert.equal(unitsAreComparable([p("a", "2026-01-01", 1, "ream")]), true);
  assert.equal(
    unitsAreComparable([p("a", "2026-01-01", 1, "ream"), p("b", "2026-01-02", 1, "ream")]),
    true,
  );
  assert.equal(
    unitsAreComparable([p("a", "2026-01-01", 1, "ream"), p("b", "2026-01-02", 1, "sheet")]),
    false,
  );
  // A missing unit is its own unit, not a wildcard that matches everything.
  assert.equal(
    unitsAreComparable([p("a", "2026-01-01", 1, null), p("b", "2026-01-02", 1, "ream")]),
    false,
  );
});

test("a price too small for paise still shows a number", () => {
  assert.equal(unitMoney(0.004, "INR"), "₹0.0040");
  assert.equal(unitMoney(0.285, "INR"), "₹0.29");
  assert.equal(unitMoney(0, "INR"), "₹0.00");
  assert.match(unitMoney(0.00001, "INR"), /under/);
});

// The screens group by currency before they ask, so this is unreachable from
// the app today. It exists because the alternative to checking here is every
// caller remembering to, and the failure is silent: a cheapest vendor picked
// by comparing a rupee figure with a euro one looks exactly like a right one.
test("prices in two currencies are not compared, and no vendor is named", () => {
  const purchases = [
    p("sharma", "2026-04-02", 254, "kg", "INR"),
    p("brussels", "2026-05-11", 12, "kg", "EUR"),
  ];

  const comparison = comparePrices(purchases);
  assert.equal(comparison.comparable, false);
  if (!comparison.comparable) {
    assert.match(comparison.reason, /EUR and INR/);
    assert.match(comparison.reason, /not compared/i);
  }

  assert.equal(cheapestVendorNow(purchases), null);
  assert.equal(unitsAreComparable(purchases), false);
});

test("one currency in convertible units still compares", () => {
  const purchases = [
    p("sharma", "2026-04-02", 254, "kg", "INR"),
    p("nandi", "2026-05-11", 0.2, "g", "INR"),
  ];

  assert.equal(comparePrices(purchases).comparable, true);
  assert.equal(cheapestVendorNow(purchases)?.vendor_id, "nandi");
});

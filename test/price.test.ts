import assert from "node:assert/strict";
import { test } from "node:test";
import { unitMoney } from "../lib/format.ts";

import { cheapestVendorNow, unitsAreComparable } from "../lib/price.ts";

const p = (
  vendor: string,
  date: string,
  unit_price: number,
  unit: string | null = "ream",
) => ({
  vendor_id: vendor,
  vendor_name: vendor,
  invoice_date: date,
  unit_price,
  unit,
});

test("cheapest is the lowest current price, not the lowest ever charged", () => {
  // The exact shape of the demo paper data, which is where this was wrong:
  // Sharma once charged 254 but now charges 268, and Nandi is now cheapest.
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
  // Rs4 a kilogram is Rs0.004 a gram. The ordinary formatter shows Rs0.00,
  // which reads as free and makes the movement figure beside it look invented.
  assert.equal(unitMoney(0.004), "₹0.0040");
  assert.equal(unitMoney(0.285), "₹0.29");
  assert.equal(unitMoney(0), "₹0.00");
  assert.match(unitMoney(0.00001), /under/);
});

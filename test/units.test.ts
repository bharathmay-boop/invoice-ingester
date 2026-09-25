// Units decide whether two prices mean the same thing. Getting this wrong is
// the quietest way this product could be wrong: a spend figure off by a factor
// of 500 looks exactly like a spend figure.
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseUnit, perUnitLabel, printedUnit, toBaseUnit } from "../lib/units.ts";
import { cheapestVendorNow, comparePrices, unitsAreComparable } from "../lib/price.ts";

test("the same unit written differently is the same unit", () => {
  for (const spelling of ["kg", "Kg", "KGS", " kgs ", "Kilograms", "kilogram"]) {
    assert.equal(parseUnit(spelling)?.per, 1000, spelling);
  }
  for (const spelling of ["pc", "PCS", "pieces", "Nos.", "each", "unit"]) {
    assert.equal(parseUnit(spelling)?.family, "count", spelling);
  }
});

test("no unit printed means one of a thing", () => {
  // "3 staplers at Rs320" and "3 pc at Rs320" are the same line.
  assert.deepEqual(parseUnit(null), parseUnit("pc"));
  assert.deepEqual(parseUnit(""), parseUnit("each"));
});

test("a pack size is not a unit, and is not guessed at", () => {
  // A ream is 500 sheets of one particular paper, not 500 of anything. A box
  // is whatever the supplier put in it.
  for (const pack of ["ream", "reams", "box", "carton", "bundle", "packet"]) {
    assert.equal(parseUnit(pack), null, pack);
  }
});

test("a price converts to its base unit", () => {
  // Rs285 a kilogram is 28.5 paise a gram.
  assert.equal(toBaseUnit("kg", 285)?.price, 0.285);
  assert.equal(toBaseUnit("g", 0.285)?.price, 0.285);
  // A dozen at Rs120 is Rs10 each.
  assert.equal(toBaseUnit("dozen", 120)?.price, 10);
  // And a quantity comes with it, so 2 kg is 2000 g.
  assert.equal(toBaseUnit("kg", 285, 2)?.quantity, 2000);
});

test("an unconvertible unit gives no answer rather than a wrong one", () => {
  assert.equal(toBaseUnit("ream", 285), null);
  assert.equal(toBaseUnit("kg", Number.NaN), null);
  assert.equal(toBaseUnit("kg", -1), null);
});

const buy = (vendor: string, unit: string | null, price: number, date = "2026-04-01") => ({
  vendor_id: vendor,
  vendor_name: vendor,
  unit,
  unit_price: price,
  invoice_date: date,
});

test("the same product bought by the kilo and by the gram is one comparison", () => {
  const result = comparePrices([buy("a", "kg", 285), buy("b", "g", 0.3)]);
  assert.equal(result.comparable, true);
  if (!result.comparable) return;
  assert.equal(result.family, "mass");
  assert.deepEqual(
    result.priced.map((p) => p.basePrice),
    [0.285, 0.3],
  );
});

test("a pack size stops a comparison across units, and says why", () => {
  const result = comparePrices([buy("a", "ream", 285), buy("b", "sheet", 0.57)]);
  assert.equal(result.comparable, false);
  if (result.comparable) return;
  assert.match(result.reason, /ream/);
  assert.match(result.reason, /per invoice unit/);
});

test("but two prices in the same pack size still answer each other", () => {
  // Two prices per ream are comparable with each other. They just cannot be
  // compared with a price per sheet.
  const result = comparePrices([buy("a", "ream", 285), buy("b", "Ream", 260)]);
  assert.equal(result.comparable, true);
  if (!result.comparable) return;
  assert.equal(result.family, null, "no family: this is the printed unit, not a converted one");
  assert.equal(result.label, "per ream");
  assert.deepEqual(result.priced.map((p) => p.basePrice), [285, 260]);
});

test("units measuring different things are not compared", () => {
  const result = comparePrices([buy("a", "kg", 285), buy("b", "litre", 90)]);
  assert.equal(result.comparable, false);
  if (result.comparable) return;
  assert.match(result.reason, /mass and volume|volume and mass/);
});

test("cheapest is decided per base unit, not per printed price", () => {
  // Rs0.30 a gram is Rs300 a kilo, so the kilo vendor is cheaper despite the
  // larger number. The old comparison picked the smaller number and was wrong
  // by a factor of a thousand.
  const best = cheapestVendorNow([buy("kilo-vendor", "kg", 285), buy("gram-vendor", "g", 0.3)]);
  assert.equal(best?.vendor_id, "kilo-vendor");
});

test("prices in one pack size still name a cheapest vendor", () => {
  const best = cheapestVendorNow([buy("a", "ream", 285), buy("b", "ream", 260)]);
  assert.equal(best?.vendor_id, "b");
  assert.equal(unitsAreComparable([buy("a", "ream", 285), buy("b", "sheet", 1)]), false);
});

test("the label reads like something a person would say", () => {
  assert.equal(perUnitLabel("mass"), "per g");
  assert.equal(perUnitLabel("count"), "each");
});

test("a pack size spelled plural is the same pack size", () => {
  // "ream" and "reams" are one pack, so two prices in them still answer each
  // other. Treating them as different suppressed the trend on the exact case
  // this feature is about.
  const result = comparePrices([buy("a", "ream", 285), buy("b", "Reams", 260)]);
  assert.equal(result.comparable, true);
  if (!result.comparable) return;
  assert.equal(result.label, "per ream");
});

test("a real unit ending in s is not mangled into something else", () => {
  // "gms" and "pcs" are grams and pieces, handled as real units, not as a
  // plural to be trimmed.
  assert.equal(parseUnit("gms")?.family, "mass");
  assert.equal(parseUnit("pcs")?.family, "count");
  assert.equal(printedUnit("box"), "box");
  assert.equal(printedUnit("boxes"), "boxe", "only a trailing s is removed, not an English plural");
});

test("a cheapest vendor is never named across units that do not compare", () => {
  // A price per ream against a price per sheet has no cheaper side, and
  // answering anyway is a sourcing decision made on a meaningless number.
  assert.equal(cheapestVendorNow([buy("a", "ream", 285), buy("b", "sheet", 0.57)]), null);
  assert.equal(cheapestVendorNow([buy("a", "kg", 285), buy("b", "litre", 90)]), null);
  // Convertible units still answer.
  assert.equal(cheapestVendorNow([buy("a", "kg", 285), buy("b", "g", 0.3)])?.vendor_id, "a");
});

// What a contract says about one invoice line. Three of the six answers are
// right even when the rate was read badly, so they are tested hardest: they are
// the part of this epic that does not depend on a model getting a number off a
// table correctly.
import assert from "node:assert/strict";
import { test } from "node:test";

import { assess, checkTolerance, MAX_TOLERANCE_PERCENT } from "../lib/contracts/variance.ts";

const line = (over: Partial<{ unit_price: number; quantity: number; unit: string | null }> = {}) => ({
  unit_price: 285,
  quantity: 10,
  unit: "ream" as string | null,
  ...over,
});

const rate = (over: Partial<{ rate: number; unit: string | null }> = {}) => ({
  rate: 285,
  unit: "ream" as string | null,
  effective_from: "2025-04-01",
  effective_to: "2026-03-31",
  ...over,
});

test("a supplier with no contract is silence, not a finding", () => {
  // The alternative lights up every invoice from every uncontracted supplier,
  // which trains people to ignore the whole screen.
  assert.equal(assess({ kind: "no_contract" }, line()), null);
});

test("a date no contract covers is a finding, and needs no rate to be right", () => {
  const found = assess({ kind: "outside_period" }, line());
  assert.equal(found?.tag, "outside_contract_period");
  assert.equal(found?.contracted, null);
  assert.equal(found?.impact, null, "there is no agreed figure, so there is no money to name");
});

test("an item a covering contract never prices is its own finding", () => {
  const found = assess({ kind: "not_priced" }, line());
  assert.equal(found?.tag, "not_in_contract");
  assert.equal(found?.contracted, null);
});

test("the agreed price is a match", () => {
  const found = assess({ kind: "covered", rate: rate() }, line());
  assert.equal(found?.tag, "matches_contract");
  assert.equal(found?.impact, 0);
});

test("rounding is forgiven and a real rise is not", () => {
  const rounding = assess({ kind: "covered", rate: rate() }, line({ unit_price: 285.5 }));
  assert.equal(rounding?.tag, "matches_contract", "0.18 percent is inside the default half percent");

  const rise = assess({ kind: "covered", rate: rate() }, line({ unit_price: 312 }));
  assert.equal(rise?.tag, "billed_above_contract");
  assert.equal(rise?.difference, 27);
  assert.equal(rise?.impact, 270, "ten reams at twenty seven over");
});

test("billed under contract is said, and said as its own thing", () => {
  // Not leakage, and it should never read like an accusation. It usually means
  // a revision landed that has not been ingested.
  const found = assess({ kind: "covered", rate: rate() }, line({ unit_price: 262 }));
  assert.equal(found?.tag, "billed_below_contract");
  assert.equal(found?.difference, -23);
});

test("kilograms and grams are the same agreement written two ways", () => {
  const found = assess(
    { kind: "covered", rate: rate({ rate: 45, unit: "kg" }) },
    line({ unit_price: 0.045, unit: "g", quantity: 2000 }),
  );
  assert.equal(found?.tag, "matches_contract");
});

test("a rise hidden by switching units is still caught, and the money is right", () => {
  // Agreed at 45 a kilogram, billed at 0.05 a gram, which is 50 a kilogram.
  const found = assess(
    { kind: "covered", rate: rate({ rate: 45, unit: "kg" }) },
    line({ unit_price: 0.05, unit: "g", quantity: 2000 }),
  );
  assert.equal(found?.tag, "billed_above_contract");
  // Two thousand grams at half a paisa over the gram.
  assert.ok(Math.abs((found?.impact ?? 0) - 10) < 1e-9, `impact was ${found?.impact}`);
});

test("a pack size against a real unit is refused rather than guessed", () => {
  // A ream is five hundred sheets of one particular paper, not five hundred of
  // anything. Comparing anyway is wrong by a factor of five hundred.
  const found = assess(
    { kind: "covered", rate: rate({ rate: 285, unit: "ream" }) },
    line({ unit_price: 0.57, unit: "sheet" }),
  );
  assert.equal(found?.tag, "units_differ");
  assert.equal(found?.impact, null);
  assert.match(found?.reason ?? "", /pack size/);
});

test("two units that measure different things are refused too", () => {
  const found = assess(
    { kind: "covered", rate: rate({ rate: 45, unit: "kg" }) },
    line({ unit_price: 45, unit: "l" }),
  );
  assert.equal(found?.tag, "units_differ");
  assert.match(found?.reason ?? "", /different things/);
});

test("the tolerance has to stay a tolerance", () => {
  assert.equal(checkTolerance(0), 0);
  assert.equal(checkTolerance(2), 2);
  assert.throws(() => checkTolerance(-1), /zero percent or more/);
  assert.throws(() => checkTolerance(MAX_TOLERANCE_PERCENT + 1), /stops catching/);
});

test("a wider tolerance forgives more, and is the only thing that changes", () => {
  const strict = assess({ kind: "covered", rate: rate() }, line({ unit_price: 290 }), 0.5);
  assert.equal(strict?.tag, "billed_above_contract");

  const loose = assess({ kind: "covered", rate: rate() }, line({ unit_price: 290 }), 5);
  assert.equal(loose?.tag, "matches_contract");
});

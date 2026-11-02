// An escalation is expanded by the model into one rate per period, and nothing
// checked its arithmetic: simple interest where compound was meant gives 110
// instead of 110.25 in year three, on a rate card that looks ordinary (#153).
import assert from "node:assert/strict";
import { test } from "node:test";

import { checkEscalation, statedYearlyRise } from "../lib/contracts/escalation.ts";

const rule = {
  kind: "escalation",
  label: "Annual increase",
  summary: "Rates rise 5% each 1 April",
  quote: "All rates shall increase by five percent (5%) on each 1st April.",
};
const rate = (rate: number, from: string, printed_name = "A4 Paper 500 Sheets") => ({ printed_name, rate, effective_from: from });

test("a series written as simple interest where compound was meant is flagged", () => {
  const found = checkEscalation([rate(100, "2026-04-01"), rate(105, "2027-04-01"), rate(110, "2028-04-01")], [rule]);
  assert.equal(found.length, 1);
  assert.equal(found[0].read, 110);
  assert.equal(found[0].expected, 110.25);
  assert.equal(found[0].effective_from, "2028-04-01");
  assert.equal(found[0].quote, rule.quote);
});

test("a correctly compounded series, and each item on its own, pass", () => {
  assert.deepEqual(checkEscalation([rate(100, "2026-04-01"), rate(105, "2027-04-01"), rate(110.25, "2028-04-01")], [rule]), []);
  assert.deepEqual(
    checkEscalation([rate(100, "2026-04-01"), rate(50, "2026-04-01", "Stapler"), rate(105, "2027-04-01"), rate(52.5, "2027-04-01", "Stapler")], [rule]),
    [],
  );
});

test("nothing is checked without a rule it can read, or with two that disagree", () => {
  const series = [rate(100, "2026-04-01"), rate(107, "2027-04-01")];
  assert.deepEqual(checkEscalation(series, []), []);
  assert.deepEqual(checkEscalation(series, [{ ...rule, summary: "Linked to WPI", quote: "rates move with the wholesale price index" }]), []);
  assert.deepEqual(checkEscalation(series, [rule, { ...rule, summary: "Rates rise 7% each year", quote: "7% annually" }]), []);
});

test("the rise is read from the words a contract uses", () => {
  assert.equal(statedYearlyRise("increase by five percent (5%) on each 1st April"), 0.05);
  assert.equal(statedYearlyRise("an escalation of 3.5 per cent per annum"), 0.035);
  assert.equal(statedYearlyRise("rises 4% annually"), 0.04);
  assert.equal(statedYearlyRise("rates move with the wholesale price index"), null);
  assert.equal(statedYearlyRise("a one-off 5% increase on renewal"), null, "not yearly");
});

test("the review screen is given the mismatches and shows them", async () => {
  const { readFileSync } = await import("node:fs");
  assert.match(readFileSync("app/contracts/[id]/page.tsx", "utf8"), /escalation=\{checkEscalation\(contract\.rates, contract\.other_terms\)\}/);
  assert.match(readFileSync("app/contracts/[id]/review.tsx", "utf8"), /escalation\.length > 0 &&/);
});

// From the Kimi K2.5 review on #290.
test("a percentage only counts when the yearly wording is in the same sentence", () => {
  assert.equal(statedYearlyRise("Interest on late payment is 10%. Rates escalate each year per the CPI."), null);
  assert.equal(statedYearlyRise("Late payment carries 2% interest. Rates rise by 5% each 1st April."), 0.05);
  assert.equal(statedYearlyRise("an escalation of 3.5 per cent per annum"), 0.035, "a decimal is not a sentence end");
});

test("two rates for one item on one date are not compared, and a bad date is skipped", () => {
  const twins = [rate(100, "2026-04-01"), rate(105, "2026-04-01"), rate(110, "2027-04-01")];
  assert.deepEqual(checkEscalation(twins, [rule]), []);
  const broken = [{ printed_name: "A4", rate: 100, effective_from: new Date("not a date") }, rate(100, "2026-04-01", "A4"), rate(105, "2027-04-01", "A4")];
  assert.deepEqual(checkEscalation(broken, [rule]), []);
});

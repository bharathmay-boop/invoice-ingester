// Date.parse rolls 30 February forward to 2 March, so an impossible date
// passed both schemas and was then refused by Postgres, which recorded a
// database error against a document that had been read fine (#117).
import assert from "node:assert/strict";
import { test } from "node:test";

import { isCalendarDate } from "../lib/calendar-date.ts";

test("real dates pass, including a leap day in a leap year", () => {
  for (const d of ["2026-01-01", "2026-12-31", "2028-02-29", "2026-04-30"]) {
    assert.equal(isCalendarDate(d), true, d);
  }
});

test("years under 100 and the century rules are read as the calendar has them", () => {
  // Date would read year 99 as 1999. Kimi K2.5 review on #279.
  assert.equal(isCalendarDate("0099-12-31"), true);
  assert.equal(isCalendarDate("0004-02-29"), true);
  assert.equal(isCalendarDate("1900-02-29"), false, "a century year is not a leap year");
  assert.equal(isCalendarDate("2000-02-29"), true, "unless it divides by 400");
});

test("dates that do not exist are refused", () => {
  for (const d of ["2026-02-30", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-00", "26-01-01", "2026-1-1", ""]) {
    assert.equal(isCalendarDate(d), false, d);
  }
});

test("both the contract and the invoice schema refuse 30 February", async () => {
  const { contractRateSchema } = await import("../lib/contracts/schema.ts");
  const { extractedInvoiceSchema } = await import("../lib/extract/schema.ts");
  assert.equal(contractRateSchema.shape.effective_from.safeParse("2026-02-30").success, false);
  assert.equal(contractRateSchema.shape.effective_from.safeParse("2026-02-28").success, true);
  assert.equal(extractedInvoiceSchema.shape.invoice_date.safeParse("2026-02-30").success, false);
  assert.equal(extractedInvoiceSchema.shape.invoice_date.safeParse("2026-02-28").success, true);
});

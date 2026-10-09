// The invoices list reads its filter out of the address bar, so every part is
// something a visitor could have typed. Each is accepted only if it is exactly
// what it should be, and dropped otherwise.
import assert from "node:assert/strict";
import { test } from "node:test";

import { isUuid, parseInvoiceFilter } from "../lib/invoices/filter.ts";

const VENDOR = "3f2a9c1e-7b4d-4e8a-9d11-0a5b6c7d8e9f";

test("a supplier and a date range are read as given", () => {
  assert.deepEqual(parseInvoiceFilter({ vendor: VENDOR, from: "2026-04-01", to: "2026-09-30" }), {
    vendorId: VENDOR,
    from: "2026-04-01",
    to: "2026-09-30",
  });
});

test("no parameters means no filter", () => {
  assert.deepEqual(parseInvoiceFilter({}), { vendorId: null, from: null, to: null });
});

test("a supplier that is not an id is dropped, never passed on", () => {
  for (const bad of ["acme", "1; DROP TABLE invoice", `${VENDOR}x`, "", "../../etc"]) {
    assert.equal(parseInvoiceFilter({ vendor: bad }).vendorId, null, bad);
  }
});

test("a date that is not a real date is dropped", () => {
  for (const bad of ["2026-02-31", "2026-13-01", "26-01-01", "yesterday", "2026-1-1", "2026-01-01T00:00", "", "0000-01-01", "0000-12-31"]) {
    assert.equal(parseInvoiceFilter({ from: bad }).from, null, bad);
  }
  assert.equal(parseInvoiceFilter({ to: "2024-02-29" }).to, "2024-02-29", "a leap day is real");
  assert.equal(parseInvoiceFilter({ to: "2026-02-29" }).to, null, "and in a year without one it is not");
});

test("a range that runs backwards is read the way it was meant", () => {
  assert.deepEqual(parseInvoiceFilter({ from: "2026-09-30", to: "2026-04-01" }), {
    vendorId: null,
    from: "2026-04-01",
    to: "2026-09-30",
  });
});

test("a repeated parameter uses the first one", () => {
  assert.equal(parseInvoiceFilter({ vendor: [VENDOR, "other"] }).vendorId, VENDOR);
  assert.equal(parseInvoiceFilter({ from: ["2026-04-01", "2026-05-01"] }).from, "2026-04-01");
});

test("one end of a range is enough", () => {
  assert.deepEqual(parseInvoiceFilter({ from: "2026-04-01" }), { vendorId: null, from: "2026-04-01", to: null });
  assert.deepEqual(parseInvoiceFilter({ to: "2026-04-01" }), { vendorId: null, from: null, to: "2026-04-01" });
});

// Greptile on #225. 36 characters that are hex or hyphens is not an id, and
// Postgres throws on it where the page promised a 404.
test("an id is the whole uuid shape, not just 36 plausible characters", () => {
  assert.equal(isUuid(VENDOR), true);
  assert.equal(isUuid("-".repeat(36)), false);
  assert.equal(isUuid("a".repeat(36)), false);
  assert.equal(isUuid(`${VENDOR}0`), false);
  assert.equal(isUuid(""), false);
});

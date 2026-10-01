// Vendor identity depends on these functions, so their behaviour is pinned
// separately from database and extraction tests.
import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeAddress, normalizeTaxId } from "../lib/vendors/normalize.ts";

test("tax registration formatting does not change its identity", () => {
  assert.equal(normalizeTaxId("DE123456789"), normalizeTaxId("de 123 456 789"));
  assert.equal(normalizeTaxId("29 ABC DE 1234 F1 Z5"), "29ABCDE1234F1Z5");
});

test("address punctuation and spacing do not change its identity", () => {
  assert.equal(
    normalizeAddress("14 Residency Road, Bengaluru 560025"),
    normalizeAddress("14 residency road bengaluru 560025"),
  );
  assert.notEqual(
    normalizeAddress("14 Residency Road, Bengaluru"),
    normalizeAddress("3rd Cross, Malleshwaram"),
  );
});

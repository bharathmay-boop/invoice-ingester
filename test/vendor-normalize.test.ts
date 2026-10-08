// Vendor identity depends on these functions, so their behaviour is pinned
// separately from database and extraction tests.
import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultVendorId, normalizeAddress, normalizeTaxId } from "../lib/vendors/normalize.ts";

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

// #134: the review screen used to open on whichever supplier sorted first, so
// a contract could attach to someone who never signed it while every rate on
// screen still read correctly.
test("the review screen opens on the supplier the contract names", () => {
  const vendors = [
    { id: "acme", name: "Acme Traders Pvt Ltd" },
    { id: "northwind", name: "Northwind Stationers Pvt. Ltd." },
  ];
  assert.equal(defaultVendorId(vendors, "Northwind Stationers Pvt Ltd"), "northwind");
  assert.equal(defaultVendorId(vendors, "ACME  TRADERS PVT LTD"), "acme");
});

test("an unrecognised supplier opens on the new one, not the first in the list", () => {
  const vendors = [
    { id: "acme", name: "Acme Traders Pvt Ltd" },
    { id: "northwind", name: "Northwind Stationers Pvt Ltd" },
  ];
  assert.equal(defaultVendorId(vendors, "Oakridge Paper Co"), "new");
  assert.equal(defaultVendorId(vendors, ""), "new");
  assert.equal(defaultVendorId(vendors, "   "), "new");
  assert.equal(defaultVendorId([], "Acme Traders Pvt Ltd"), "new");
});

test("a partial name is not treated as a match", () => {
  const vendors = [{ id: "acme", name: "Acme Traders Pvt Ltd" }];
  assert.equal(defaultVendorId(vendors, "Acme"), "new");
  assert.equal(defaultVendorId(vendors, "Acme Traders Pvt Ltd Mumbai"), "new");
});

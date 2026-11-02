// Two upload surfaces, /upload for invoices and /contracts for contracts, left
// someone holding a PDF guessing which page they wanted (#150). One page now
// takes either, with the kind chosen on it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { uploadKind } from "../lib/upload-kind.ts";

test("the kind comes from the address, and anything else means invoices", () => {
  assert.equal(uploadKind("contract"), "contract");
  assert.equal(uploadKind("invoice"), "invoice");
  assert.equal(uploadKind(undefined), "invoice");
  assert.equal(uploadKind("receipt"), "invoice");
  assert.equal(uploadKind(["contract", "invoice"]), "invoice");
});

test("the upload page offers both, and each goes to its own pipeline", () => {
  const page = readFileSync("app/upload/page.tsx", "utf8");
  assert.match(page, /<Dropzone\b/);
  assert.match(page, /<ContractDropzone\b/);
  assert.match(page, /<UploadTabs\b/);
});

test("the contracts page lists contracts and sends uploads to the one page", () => {
  const contracts = readFileSync("app/contracts/page.tsx", "utf8");
  assert.ok(!contracts.includes("<ContractDropzone"), "a second upload surface is back");
  assert.match(contracts, /href="\/upload\?kind=contract"/);
});

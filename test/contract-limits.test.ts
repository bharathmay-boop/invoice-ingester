// What gets turned away before anything is uploaded.
//
// These refusals run in the browser, before the file reaches blob storage, so
// a hole here is a 200 page scan uploaded and then failed by a worker, with the
// person told nothing useful. The reason text is part of what is tested: it is
// shown to a person verbatim and has to name the file and say what to do.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONTRACT_ACCEPT_ATTRIBUTE,
  MAX_CONTRACT_BYTES,
  rejectContract,
} from "../lib/contracts/limits.ts";

const pdf = (size: number, name = "rate-contract.pdf") => ({
  name,
  type: "application/pdf",
  size,
});

test("an ordinary PDF is accepted", () => {
  assert.equal(rejectContract(pdf(2 * 1024 * 1024)), null);
});

test("anything that is not a PDF is refused by type, not by extension", () => {
  // Named .pdf, actually a JPEG. The type is what is checked, because a
  // renamed photograph is the common way this arrives.
  const refusal = rejectContract({ name: "scan.pdf", type: "image/jpeg", size: 400_000 });
  assert.match(refusal?.reason ?? "", /scan\.pdf is not a PDF/);
});

test("an image is refused even though invoices accept one", () => {
  assert.notEqual(rejectContract({ name: "page1.png", type: "image/png", size: 10_000 }), null);
});

test("a file over the size limit says how big it is and what the limit is", () => {
  const refusal = rejectContract(pdf(MAX_CONTRACT_BYTES + 1));
  assert.match(refusal?.reason ?? "", /51 MB, over the 50 MB limit/);
});

test("a file exactly on the limit is allowed", () => {
  assert.equal(rejectContract(pdf(MAX_CONTRACT_BYTES)), null);
});

test("an empty file is refused rather than queued and failed later", () => {
  const refusal = rejectContract(pdf(0));
  assert.match(refusal?.reason ?? "", /is empty/);
});

test("the file picker offers what the check accepts", () => {
  // These two disagreeing means the picker shows a file the check then refuses.
  assert.equal(CONTRACT_ACCEPT_ATTRIBUTE, ".pdf");
});

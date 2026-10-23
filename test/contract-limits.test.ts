// What gets turned away before anything is uploaded.
//
// These refusals run in the browser, before the file reaches blob storage, so
// a hole here is a 200 page scan uploaded and then failed by a worker, with the
// person told nothing useful. The reason text is part of what is tested: it is
// shown to a person verbatim and has to name the file and say what to do.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
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

// --- what the worker refuses before paying a provider to read it -----------

const { refuseBeforeReading, MAX_CONTRACT_PAGES } = await import("../lib/contracts/limits.ts");

test("the worker refuses an over-long contract before the paid read", () => {
  assert.equal(refuseBeforeReading({ pages: MAX_CONTRACT_PAGES, encrypted: false }), null);
  assert.match(
    refuseBeforeReading({ pages: MAX_CONTRACT_PAGES + 1, encrypted: false }) ?? "",
    new RegExp(`${MAX_CONTRACT_PAGES + 1} pages.*${MAX_CONTRACT_PAGES}`),
  );
});

test("the worker refuses a locked or unreadable PDF before the paid read", () => {
  assert.match(refuseBeforeReading({ pages: 3, encrypted: true }) ?? "", /password/);
  assert.match(refuseBeforeReading(null) ?? "", /could not be opened/);
});

// Files past the twentieth were sliced off and never mentioned, so someone
// dropping thirty contracts was told nothing about ten of them (#115).
test("files past the batch limit are refused by name, not dropped", async () => {
  const { splitBatch, MAX_CONTRACTS_PER_BATCH } = await import("../lib/contracts/limits.ts");
  const files = Array.from({ length: MAX_CONTRACTS_PER_BATCH + 3 }, (_, i) => ({ name: `c${i + 1}.pdf` }));
  const { batch, overflow } = splitBatch(files);
  assert.equal(batch.length, MAX_CONTRACTS_PER_BATCH);
  assert.deepEqual(
    overflow.map((o) => o.name),
    [`c${MAX_CONTRACTS_PER_BATCH + 1}.pdf`, `c${MAX_CONTRACTS_PER_BATCH + 2}.pdf`, `c${MAX_CONTRACTS_PER_BATCH + 3}.pdf`],
  );
  assert.match(overflow[0].reason, new RegExp(`${MAX_CONTRACTS_PER_BATCH} at a time`));
  assert.deepEqual(splitBatch(files.slice(0, 2)).overflow, []);
});

test("the dropzone lists the refused overflow", () => {
  const dropzone = readFileSync("app/contracts/contract-dropzone.tsx", "utf8");
  assert.match(dropzone, /splitBatch\(/);
  assert.ok(!dropzone.includes("files.slice(0, MAX_CONTRACTS_PER_BATCH)"), "the silent slice is back");
});

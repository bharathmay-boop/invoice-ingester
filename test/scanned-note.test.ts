// A PDF with a full text layer was called a scan because none of its quotes
// matched: "every rate has no page" was taken to mean "the document has no
// text". They are different facts and get different sentences (#135).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { hasTextLayer, pageNote } from "../lib/contracts/page-note.ts";

const unplaced = [{ source_page: null }, { source_page: null }];
const placed = [{ source_page: 3 }, { source_page: null }];

test("a document with text is never called a scan", () => {
  assert.equal(pageNote(true, unplaced), "unmatched");
  assert.equal(pageNote(true, placed), null);
  assert.equal(pageNote(true, []), null);
});

test("a real scan says so", () => {
  assert.equal(pageNote(false, unplaced), "scan");
  assert.equal(pageNote(false, []), "scan");
});

test("a contract read before the flag was stored makes no claim either way", () => {
  assert.equal(pageNote(undefined, unplaced), "unmatched");
  assert.equal(pageNote(undefined, placed), null);
});

test("text is a page with more than a stray mark on it", () => {
  assert.equal(hasTextLayer([]), false);
  assert.equal(hasTextLayer([{ flat: "12" }]), false);
  assert.equal(hasTextLayer([{ flat: "" }, { flat: "a4 paper 80 gsm white ream 245.00" }]), true);
});

test("the worker stores the flag and the screen reads it", () => {
  assert.match(readFileSync("app/api/contracts/worker/route.ts", "utf8"), /text_layer: pages \? hasTextLayer\(pages\) : undefined/);
  const page = readFileSync("app/contracts/[id]/page.tsx", "utf8");
  assert.match(page, /pageNote\(/);
  assert.ok(!page.includes("rates.every((r) => r.source_page === null)"), "the inference is back");
});

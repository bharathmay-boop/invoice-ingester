// A jump that lands on the wrong page costs more trust than no jump at all:
// the reviewer sees nothing there and stops believing every jump in the
// product, with no way to tell a wrong jump from a field they misread.
import assert from "node:assert/strict";
import { test } from "node:test";

import { locate, type PageText } from "../lib/contracts/locate.ts";

const pages: PageText[] = [
  { page: 1, flat: "this agreement is made between sharma paper products and acme limited" },
  { page: 2, flat: "clause 9.3 rates shall rise by five percent on each first of april" },
  { page: 3, flat: 'a4 paper 80 gsm, white, per ream - rs. 285.00, firm for the contract period' },
];

test("a quote that is on the page gives that page", () => {
  const found = locate(pages, "A4 Paper 80 GSM, white, per ream - Rs. 285.00");
  assert.equal(found.page, 3);
  assert.equal(found.scanned, false);
});

test("spacing, case and the quotes a PDF renders differently do not matter", () => {
  const found = locate(pages, "A4  Paper   80 GSM,\nwhite, per ream \u2013 Rs. 285.00");
  assert.equal(found.page, 3);
});

test("a quote nothing printed finds no page rather than the nearest one", () => {
  // The important case. A model that invented a figure also invents the line
  // it came from, and guessing a page here would make the invention look
  // checked.
  assert.equal(locate(pages, "Toner cartridge 12A, per unit - Rs. 4,005.00").page, null);
});

test("a quote too short to be sure of is not matched at all", () => {
  // "per ream" appears on page 3 and would match, but a handful of words finds
  // the wrong page confidently on a long contract.
  assert.equal(locate(pages, "per ream").page, null);
});

test("a quote the model shortened is still found by its opening", () => {
  const found = locate(pages, "a4 paper 80 gsm, white, per ream - rs. 285.00 and so on and so forth");
  assert.equal(found.page, 3);
});

test("a scan with no text layer says so rather than failing to find things", () => {
  // Different from "not found": nothing can be found in this document at all,
  // so the screen says page jumps are unavailable instead of implying every
  // quote was invented.
  const scan: PageText[] = [{ page: 1, flat: "" }, { page: 2, flat: "  " }];
  const found = locate(scan, "A4 Paper 80 GSM, white, per ream");
  assert.equal(found.scanned, true);
  assert.equal(found.page, null);
});

test("a rate with no quote is not a failure", () => {
  assert.deepEqual(locate(pages, null), { page: null, scanned: false });
});

// A table row comes back tidied up with pipes between its cells, which never
// appear in the document, so not one rate on a text PDF got a page (#136).
// The cells are matched in order, close together, instead.
/** A page as readPages leaves it: lower case, whitespace collapsed. */
const page = (n: number, text: string): PageText => ({ page: n, flat: text.toLowerCase().replace(/\s+/g, " ").trim() });
const ROW = "Item Unit Rate\nA4 Paper 80 GSM White    ream    245.00\nStapler HD-45    pc    165.00";

test("a table row quoted with pipes still finds its page", () => {
  const pages = [page(1, "Supply agreement between the parties"), page(2, ROW)];
  assert.equal(locate(pages, "A4 Paper 80 GSM White | ream | 245.00").page, 2);
  assert.equal(locate(pages, "Stapler HD-45\tpc\t165.00").page, 2);
});

test("cells from different rows, or a figure the row does not have, find nothing", () => {
  const far = page(1, `A4 Paper 80 GSM White ream ${"x".repeat(300)} 245.00`);
  assert.equal(locate([far], "A4 Paper 80 GSM White | ream | 245.00").page, null);
  assert.equal(locate([page(1, ROW)], "A4 Paper 80 GSM White | ream | 999.00").page, null);
  assert.equal(locate([page(1, ROW)], "ream | 245.00").page, null, "too little to be sure of");
});

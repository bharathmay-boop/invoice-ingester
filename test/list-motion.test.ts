// The app's lists appeared all at once with no feedback, which read as
// unfinished next to the home page (#246).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { LINK_FEEDBACK, rowEnter } from "../lib/reveal.ts";

test("rows stagger in quickly, and not at all under reduced motion", () => {
  const first = rowEnter(0);
  assert.match(first.className, /^motion-safe:/, "only for people who have not asked for less motion");
  assert.equal(first.style.animationDelay, "0s");
  // A long list must not keep its last rows waiting.
  assert.equal(rowEnter(500).style.animationDelay, "0.3s");
});

test("a row link answers hover and press", () => {
  assert.match(LINK_FEEDBACK, /hover:/);
  assert.match(LINK_FEEDBACK, /active:/);
});

test("every list screen uses them", () => {
  for (const page of [
    "app/invoices/page.tsx",
    "app/items/page.tsx",
    "app/vendors/page.tsx",
    "app/suggestions/page.tsx",
    "app/findings/findings-list.tsx",
    "app/contracts/page.tsx",
  ]) {
    const source = readFileSync(page, "utf8");
    assert.match(source, /rowEnter\(/, `${page} rows do not enter`);
  }
});

// The navigation is a promise that each entry leads somewhere. #151 existed
// because the nav that was asked for could not be built: Invoices had no page.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { COUNTED, NAV_LINKS } from "../app/nav-links.ts";

test("the nav reads in the order that was settled", () => {
  assert.deepEqual(
    NAV_LINKS.map((link) => link.label),
    ["Upload", "Items", "Invoices", "Contracts", "Vendors", "Suggestions", "Findings"],
  );
});

test("every entry has a page behind it", () => {
  for (const link of NAV_LINKS) {
    assert.ok(existsSync(`app${link.href}/page.tsx`) || existsSync(`app${link.href}/layout.tsx`), link.href);
  }
});

test("no entry appears twice", () => {
  const hrefs = NAV_LINKS.map((link) => link.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
});

test("findings is reachable and carries a count like suggestions does", () => {
  assert.ok(NAV_LINKS.some((link) => link.href === "/findings"));
  assert.ok(COUNTED.has("/findings") && COUNTED.has("/suggestions"));
});

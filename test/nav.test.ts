// The navigation is a promise that each entry leads somewhere. #151 existed
// because the nav that was asked for could not be built: Invoices had no page.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

// Greptile on #225. The set above only matters if the nav reads it. A render
// test is not possible outside Next, so this holds the one line that connects
// them: remove it and the count could be dropped without anything failing.
test("the nav shows counts for exactly the entries in the shared set", () => {
  const source = readFileSync("app/nav.tsx", "utf8");
  assert.match(source, /COUNTED\.has\(link\.href\)/);
  assert.match(source, /"\/findings":\s*findings/);
});

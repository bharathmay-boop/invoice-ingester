// The contract check is what sets this apart from an extraction tool, and the
// home page gave it one tab (#240).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { PUBLIC_LINKS } from "../app/nav-links.ts";

test("the header links to the contracts section", () => {
  assert.ok(PUBLIC_LINKS.some((link) => link.href === "/#contracts"));
});

test("the section shows the four things the contract check does", () => {
  const section = readFileSync("app/contracts-section.tsx", "utf8");
  for (const claim of [
    /read in the background/i,
    /page \d+/i,
    /nothing (counts|is checked) until/i,
    /Findings/,
  ]) {
    assert.match(section, claim);
  }
  assert.match(readFileSync("app/page.tsx", "utf8"), /<ContractsSection \/>/);
});

// "What it will not do" is the clearest evidence of judgement in the project,
// so the home page shows it, and it has to say what the README says (#241).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { LIMITS } from "../app/limits.ts";
import { PUBLIC_LINKS } from "../app/nav-links.ts";

const readme = readFileSync("README.md", "utf8");
const section = readme.split("## What it will not do")[1].split("\n## ")[0];
const headings = [...section.matchAll(/^- \*\*(.+?)\*\*/gm)].map((m) => m[1]);

test("the home page lists the same limits as the README, in the same order", () => {
  assert.ok(headings.length >= 5, "README list not found");
  assert.deepEqual(
    LIMITS.map((limit) => limit.title),
    headings,
  );
});

test("each limit says why in a sentence or two", () => {
  for (const limit of LIMITS) {
    assert.ok(limit.why.length > 20 && limit.why.length < 220, limit.title);
  }
});

test("the header links to it", () => {
  assert.ok(PUBLIC_LINKS.some((link) => link.href === "/#limits"));
  assert.match(readFileSync("app/page.tsx", "utf8"), /<LimitsSection \/>/);
});

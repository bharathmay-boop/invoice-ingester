// A grid cell grows to its widest unbreakable line unless told otherwise, and
// one line in the contracts section pushed the home page 8px past a phone's
// width (#268). Each home page grid has to hold its cells to the column.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("the contracts grid keeps its cards inside the column", () => {
  const source = readFileSync("app/contracts-section.tsx", "utf8");
  const grid = source.match(/className="mt-6 grid[^"]*"/)?.[0] ?? "";
  assert.match(grid, /grid-cols-\[minmax\(0,1fr\)\]/, `grid is: ${grid}`);
});

test("the four questions stay a grid until the row of them fits", () => {
  // In one row they are about 900px wide, so a tablet at 768px scrolled
  // sideways when the row started at sm (640px).
  const source = readFileSync("app/what-it-answers.tsx", "utf8");
  const list = source.match(/<TabsList className="[^"]*"/)?.[0] ?? "";
  assert.ok(!/\b(sm|md):inline-flex\b/.test(list), `row starts too early: ${list}`);
  assert.match(list, /\blg:inline-flex\b/);
});

// The "how it was built" strip states numbers, and a number on a public page
// that is higher than the truth is worse than none (#243). They live in one
// file, and this holds the one that can be checked here.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { BUILD_STATS } from "../app/build-stats.ts";

test("the page never claims more tests than the suite has", () => {
  const actual = readdirSync("test")
    .filter((f) => f.endsWith(".test.ts"))
    .reduce((n, f) => n + [...readFileSync(`test/${f}`, "utf8").matchAll(/^\s*test\(/gm)].length, 0);
  assert.ok(BUILD_STATS.tests <= actual, `page says ${BUILD_STATS.tests}, suite has ${actual}`);
  // Kept close enough to be true in spirit, so it gets refreshed deliberately.
  assert.ok(actual - BUILD_STATS.tests < 100, `page says ${BUILD_STATS.tests}, suite has ${actual}: update it`);
});

test("every figure says when it was counted", () => {
  assert.match(BUILD_STATS.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(BUILD_STATS.pullRequests > 0);
});

test("the strip is on the home page and links the board and the source", () => {
  const strip = readFileSync("app/build-strip.tsx", "utf8");
  assert.match(strip, /BOARD_URL/);
  assert.match(strip, /SOURCE_URL/);
  assert.match(readFileSync("app/page.tsx", "utf8"), /<BuildStrip \/>/);
});

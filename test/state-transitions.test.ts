// The contract and findings screens changed state with no transition, so a
// change was easy to miss (#248).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { STATE_ENTER } from "../lib/reveal.ts";

test("a state change animates, and never under reduced motion", () => {
  assert.match(STATE_ENTER, /^motion-safe:/);
});

test("each changing piece is keyed on its state, so a change replays it", () => {
  const list = readFileSync("app/findings/findings-list.tsx", "utf8");
  assert.match(list, /<Rows key=\{filter \?\? "all"\}/, "switching the filter does not replay the rows");

  const badge = readFileSync("app/contracts/page.tsx", "utf8");
  assert.match(badge, /key=\{contract\.status\}[\s\S]{0,200}\$\{STATE_ENTER\}/);

  assert.match(readFileSync("app/findings/[lineId]/page.tsx", "utf8"), /<article className=\{STATE_ENTER\}>/);
  assert.match(readFileSync("app/contracts/[id]/page.tsx", "utf8"), /<div key=\{contract\.status\} className=\{STATE_ENTER\}>/);
});

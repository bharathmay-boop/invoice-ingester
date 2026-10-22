// How it works is the home page's account of what the product does. It used to
// stop at reading and arithmetic, the part every OCR tool has (#238).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { rowDelay, STEPS } from "../app/walkthrough-steps.ts";

test("it shows all four things that happen to an invoice, in order", () => {
  assert.deepEqual(STEPS, ["Read", "Check", "Match", "Contract"]);
});

test("no panel sits blank while its rows arrive", () => {
  // A row waits out its delay invisible, so a long stagger shows an empty box
  // to anyone scrolling past.
  for (let i = 0; i < 4; i++) assert.ok(rowDelay(i) <= 0.4, `row ${i} waits ${rowDelay(i)}s`);
  const source = readFileSync("app/home-walkthrough.tsx", "utf8");
  assert.ok(!/animationDelay: `\$\{0\.[5-9]/.test(source), "a hand written long delay is back");
});

test("every step has a panel, and the timer can still be paused", () => {
  const source = readFileSync("app/home-walkthrough.tsx", "utf8");
  for (const step of STEPS) {
    assert.match(source, new RegExp(`<TabsContent value="${step}"`), step);
  }
  assert.match(source, /<PauseIcon \/> Pause/);
});

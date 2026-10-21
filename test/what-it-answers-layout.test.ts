// On a phone the four questions used to sit in a sideways scroll, so most
// visitors only ever saw the first (#239). They are a 2 by 2 grid below sm.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("app/what-it-answers.tsx", "utf8");

test("the questions are a two column grid on a phone, not a sideways scroll", () => {
  assert.ok(!source.includes("overflow-x-auto"), "the sideways scroll is back");
  assert.match(source, /<TabsList className="[^"]*\bgrid\b[^"]*\bgrid-cols-2\b/);
});

test("a long question wraps inside its cell on a phone instead of being cut off", () => {
  assert.match(source, /<TabsTrigger[^>]*className="[^"]*\bwhitespace-normal\b/);
});

// A figure a model produced has to say so, and name the model, where it is
// shown (EU AI Act Article 50). A demo row must never claim a model read it
// (#178).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readBy } from "../lib/read-by.ts";

test("a read figure names the model from what was stored", () => {
  assert.match(readBy({ model: "google/gemini-2.5-flash" }) ?? "", /Read by google\/gemini-2\.5-flash/);
  assert.match(readBy({ model: "claude-opus-5" }) ?? "", /check/i);
});

test("demo data is never described as model read", () => {
  assert.match(readBy({ source: "demo-seed" }) ?? "", /^Demo data/);
  assert.match(readBy({ model: "google/gemini-2.5-flash" }, true) ?? "", /^Demo data/);
  assert.ok(!/read by/i.test(readBy({ source: "demo-seed" }) ?? ""));
});

test("with nothing stored, nothing is claimed", () => {
  assert.equal(readBy(null), null);
  assert.equal(readBy({}), null);
  assert.equal(readBy({ model: 42 }), null);
});

test("both review screens say it", () => {
  assert.match(readFileSync("app/review/[id]/page.tsx", "utf8"), /readBy\(/);
  assert.match(readFileSync("app/contracts/[id]/page.tsx", "utf8"), /readBy\(/);
});

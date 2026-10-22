// The sign in page is the door for every visitor: the owner with the password,
// and anyone else through the demo (#235).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { demoLanding } from "../lib/next-path.ts";

test("the demo lands on findings, the screen that shows what the product is for", () => {
  assert.equal(demoLanding(null), "/findings");
  assert.equal(demoLanding("/"), "/findings");
});

test("a demo visitor sent here from a screen goes back to it, and only on this site", () => {
  assert.equal(demoLanding("/invoices?search=paper"), "/invoices?search=paper");
  assert.equal(demoLanding("//evil.example"), "/findings");
  assert.equal(demoLanding("/\\evil.example"), "/findings");
});

// The page is a client component, which cannot be loaded outside Next, so
// these hold the two calls it makes.
test("the page offers both ways in", () => {
  const page = readFileSync("app/login/page.tsx", "utf8");
  assert.match(page, /fetch\("\/api\/session", \{\s*method: "POST"/);
  assert.match(page, /fetch\("\/api\/session\/demo", \{ method: "POST" \}\)/);
  assert.match(page, /Try the demo/);
});

// The first two questions a buyer asks about an AI product are what it costs
// and who sees the data, and the home page answered neither (#242).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { PUBLIC_LINKS } from "../app/nav-links.ts";

test("the section says which models, what it costs first, and how keys are kept", () => {
  const section = readFileSync("app/models-section.tsx", "utf8");
  for (const claim of [/Anthropic|Claude/, /OpenRouter/, /before/i, /Test connection/, /AES-256-GCM/]) {
    assert.match(section, claim);
  }
  // The batch threshold is read from the code that enforces it, not retyped.
  assert.match(section, /DEFAULT_BATCH_CONFIRM_AT/);
  assert.match(readFileSync("app/page.tsx", "utf8"), /<ModelsSection \/>/);
});

test("the header links to it", () => {
  assert.ok(PUBLIC_LINKS.some((link) => link.href === "/#models"));
});

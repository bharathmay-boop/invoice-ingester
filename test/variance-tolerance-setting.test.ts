// The variance tolerance had no screen (#122). The save goes through the one
// function that both refuses a tolerance that disables the check and re-checks
// every supplier; the database behaviour is tested in contract-lookup.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("settings can set the contract tolerance, and saving re-checks", () => {
  const actions = readFileSync("app/settings/actions.ts", "utf8");
  const save = actions.slice(actions.indexOf("export async function saveVarianceTolerance"));
  assert.match(save, /await requireSession\(\)/);
  assert.match(save, /setToleranceAndRecheck\(/);
  assert.match(save, /trim\(\) === ""/, "an empty box would save zero");

  const page = readFileSync("app/settings/page.tsx", "utf8");
  assert.match(page, /action=\{saveVarianceTolerance\}/);
  assert.match(page, /max: MAX_TOLERANCE_PERCENT/);
});

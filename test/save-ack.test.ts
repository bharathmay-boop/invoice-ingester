// Saving an invoice sent you to /vendors?saved=<id>, or on to the next invoice
// from the same file, and nothing read "saved": a save looked like any other
// navigation (#247).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { afterSave, savedFrom } from "../lib/save-ack.ts";

const ID = "7f74f3d7-7483-4deb-88ec-55a8734d98f7";

test("both places a save can land carry which invoice was saved", () => {
  assert.equal(afterSave(null, ID), `/vendors?saved=${ID}`);
  assert.equal(afterSave("d1e2", ID), `/review/d1e2?saved=${ID}`);
});

test("only an invoice id is read back from the address", () => {
  assert.equal(savedFrom(ID), ID);
  assert.equal(savedFrom(undefined), null);
  assert.equal(savedFrom("1; DROP TABLE invoice"), null);
  assert.equal(savedFrom([ID, ID]), null);
});

test("the vendors page and the review page both say so", () => {
  for (const page of ["app/vendors/page.tsx", "app/review/[id]/page.tsx"]) {
    assert.match(readFileSync(page, "utf8"), /<SavedNotice /, page);
  }
  assert.match(readFileSync("app/review/[id]/actions.ts", "utf8"), /afterSave\(/);
});

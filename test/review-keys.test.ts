// Whether Enter saves is the difference between a flagged invoice being
// looked at and one being waved through by reflex on the way through a stack.
import assert from "node:assert/strict";
import { test } from "node:test";

import { intentOf } from "../lib/review-keys.ts";

const clean = { addsUp: true, saving: false, hasNext: true };

test("Enter saves an invoice whose figures agree", () => {
  assert.equal(intentOf({ key: "Enter", tagName: "INPUT" }, clean), "save");
});

test("Enter does nothing while the figures disagree", () => {
  // Saving a flagged invoice stays a deliberate act: the button is still
  // there, and it says what it will do.
  assert.equal(intentOf({ key: "Enter", tagName: "INPUT" }, { ...clean, addsUp: false }), null);
});

test("Enter does not save twice while a save is running", () => {
  assert.equal(intentOf({ key: "Enter", tagName: "INPUT" }, { ...clean, saving: true }), null);
});

test("Enter on a button is the button's own, not a save", () => {
  // Otherwise Enter on Discard would save instead of discarding.
  assert.equal(intentOf({ key: "Enter", tagName: "BUTTON" }, clean), null);
  assert.equal(intentOf({ key: "Enter", tagName: "TEXTAREA" }, clean), null);
});

test("a modified Enter is left alone", () => {
  for (const modifier of ["shiftKey", "ctrlKey", "metaKey"] as const) {
    assert.equal(intentOf({ key: "Enter", tagName: "INPUT", [modifier]: true }, clean), null, modifier);
  }
});

test("alt and right arrow moves to the next invoice in the file", () => {
  assert.equal(intentOf({ key: "ArrowRight", altKey: true, tagName: "INPUT" }, clean), "next");
  // Plain arrow keys belong to the field being edited.
  assert.equal(intentOf({ key: "ArrowRight", tagName: "INPUT" }, clean), null);
  // And there is nowhere to go when this is the only invoice in the file.
  assert.equal(
    intentOf({ key: "ArrowRight", altKey: true, tagName: "INPUT" }, { ...clean, hasNext: false }),
    null,
  );
});

test("every other key is the field's business", () => {
  for (const key of ["a", "Tab", "Escape", "ArrowLeft", " "]) {
    assert.equal(intentOf({ key, tagName: "INPUT" }, clean), null, key);
  }
});

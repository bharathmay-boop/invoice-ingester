// What a stored file is, decided from its bytes where they say, rather than
// from the type the browser reported. A PDF labelled as an image would
// otherwise skip the page count that keeps a 300 page file from being paid for.
import assert from "node:assert/strict";
import { test } from "node:test";

const { storedType } = await import("../lib/upload.ts");

const bytes = (text: string) => new TextEncoder().encode(text);

test("a file whose bytes are a PDF is a PDF, whatever it was called", () => {
  assert.equal(storedType(bytes("%PDF-1.7\n..."), "image/png"), "application/pdf");
  assert.equal(storedType(bytes("%PDF-1.4"), "application/pdf"), "application/pdf");
});

test("anything else keeps the type it was accepted with", () => {
  assert.equal(storedType(bytes("\x89PNG\r\n"), "image/png"), "image/png");
  assert.equal(storedType(bytes("\xff\xd8\xff"), "image/jpeg"), "image/jpeg");
});

test("a declared PDF that is not one stays a PDF, so the page count refuses it", () => {
  assert.equal(storedType(bytes("not a pdf"), "application/pdf"), "application/pdf");
});

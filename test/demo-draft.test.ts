import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { demoDraft, draftText } from "../lib/demo/draft.ts";
import { invoicePng } from "../lib/demo/invoice-png.ts";

test("the demo draft has a total that does not add up, found by the real check", () => {
  const { discrepancies, invoice } = demoDraft();
  assert.ok(discrepancies.length > 0);
  assert.ok(invoice.total > invoice.subtotal);
});

test("the image says what the fields say", () => {
  const text = draftText().join("\n");
  const { invoice, vendor } = demoDraft();
  assert.ok(text.includes(vendor.name));
  assert.ok(text.includes(invoice.number));
  for (const line of invoice.lines) assert.ok(text.includes(line.description.slice(0, 34)));
});

test("invoicePng writes a PNG whose pixels are not all paper", () => {
  const png = Buffer.from(invoicePng(["HELLO"]));
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const idat = png.indexOf("IDAT");
  const length = png.readUInt32BE(idat - 4);
  const raw = inflateSync(png.subarray(idat + 4, idat + 4 + length));
  assert.equal(raw.length, (width + 1) * height);
  assert.ok(raw.some((byte, i) => i % (width + 1) !== 0 && byte === 0), "no ink was drawn");
});

test("every character the demo invoice uses has a glyph", () => {
  // A blank where a letter should be would still be a valid PNG.
  for (const char of new Set(draftText().join("").toUpperCase())) {
    if (char === " ") continue;
    assert.notEqual(Buffer.from(invoicePng([char])).length, Buffer.from(invoicePng([" "])).length, `no glyph for ${char}`);
  }
});

test("the seed owns its draft and the screenshots refuse anyone else's", () => {
  const seed = readFileSync("scripts/seed.mjs", "utf8");
  const shots = readFileSync("scripts/screenshots.mjs", "utf8");
  assert.ok(seed.includes("DELETE FROM draft WHERE is_demo"));
  assert.match(seed, /INSERT INTO draft[\s\S]*is_demo\)[\s\S]*true\)/);
  assert.ok(shots.includes("FROM draft    WHERE NOT is_demo"));
  assert.ok(shots.includes("WHERE is_demo AND content_type LIKE 'image/%'"));
});

test("saving the demo draft keeps it demo data, and the seed never shares its image", () => {
  const save = readFileSync("app/review/[id]/actions.ts", "utf8");
  const seed = readFileSync("scripts/seed.mjs", "utf8");
  assert.ok(save.includes("first_page, is_demo FROM draft"));
  assert.ok(save.includes("draft.is_demo,"));
  assert.ok(save.includes("{ demo: draft.is_demo }"));
  assert.match(seed, /drafts\/demo\/invoice\.png[\s\S]{0,120}addRandomSuffix: true/);
  assert.ok(seed.includes("UNION SELECT blob_url FROM invoice"));
});

// The three pieces of logic where a mistake would not announce itself:
// normalisation, match thresholds, arithmetic validation. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalize } from "../lib/items/normalize.ts";
import { parseExtraction, extractionJsonSchema } from "../lib/extract/schema.ts";

test("normalisation collapses the same product written two ways", () => {
  assert.equal(normalize("A4 Paper 500 Sheets"), normalize("Paper, A4, 1 ream"));
  assert.equal(
    normalize("Ballpoint Pen Blue (Pack of 10)"),
    normalize("blue ballpoint pen - 10 pcs"),
  );
  assert.equal(
    normalize("Sanitizer 500ml Bottle"),
    normalize("SANITIZER, 500 ML, 1 bottle"),
  );
  assert.equal(normalize("Approx. 5 kg Rice Bag"), normalize("Rice, 5kg bag"));
});

test("normalisation keeps the numbers that identify a product", () => {
  assert.notEqual(normalize("HP 802 Cartridge"), normalize("HP 803 Cartridge"));
  assert.notEqual(normalize("A4 Paper"), normalize("A3 Paper"));
  assert.match(normalize("HP 802 Cartridge"), /802/);
});

test("normalisation is stable and order independent", () => {
  assert.equal(normalize("Blue Pen"), normalize("pen   BLUE!!"));
  assert.equal(normalize("A4 Paper"), normalize(normalize("A4 Paper")));
  assert.equal(normalize("   "), "");
});

const valid = {
  vendor_name: "Sharma Stationers",
  gstin: "29ABCDE1234F1Z5",
  invoice_number: "INV-2026-114",
  invoice_date: "2026-04-11",
  line_items: [
    {
      description: "A4 Paper 500 Sheets",
      hsn_code: "4802",
      quantity: 10,
      unit: "ream",
      unit_price: 285.5,
      amount: 2855,
    },
  ],
  subtotal: 2855,
  cgst: 256.95,
  sgst: 256.95,
  igst: 0,
  total: 3368.9,
};

test("a valid payload parses", () => {
  const result = parseExtraction(valid);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.line_items[0].quantity, 10);
});

test("nullable fields accept null but not absence", () => {
  assert.equal(parseExtraction({ ...valid, gstin: null }).ok, true);
  const withoutGstin: Record<string, unknown> = { ...valid };
  delete withoutGstin.gstin;
  assert.equal(parseExtraction(withoutGstin).ok, false);
});

test("each malformed variant fails with a readable error", () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ["bad gstin", { ...valid, gstin: "29ABCDE1234F1Z" }, /gstin/],
    ["bad date format", { ...valid, invoice_date: "11/04/2026" }, /invoice_date/],
    ["impossible date", { ...valid, invoice_date: "2026-13-45" }, /invoice_date/],
    ["empty invoice number", { ...valid, invoice_number: "" }, /invoice_number/],
    ["no line items", { ...valid, line_items: [] }, /line_items/],
    ["negative total", { ...valid, total: -1 }, /total/],
    ["string amount", { ...valid, subtotal: "2855" }, /subtotal/],
    ["zero quantity", { ...valid, line_items: [{ ...valid.line_items[0], quantity: 0 }] }, /quantity/],
    ["non numeric hsn", { ...valid, line_items: [{ ...valid.line_items[0], hsn_code: "48O2" }] }, /hsn_code/],
    ["not an object", "nope", /./],
  ];

  for (const [name, payload, expected] of cases) {
    const result = parseExtraction(payload);
    assert.equal(result.ok, false, `${name} should have failed`);
    assert.match(result.ok ? "" : result.error, expected, `${name} error text`);
  }
});

test("the provider JSON schema covers every field", () => {
  const properties = Object.keys(
    (extractionJsonSchema as { properties: Record<string, unknown> }).properties,
  );
  assert.deepEqual(properties.sort(), [
    "cgst", "gstin", "igst", "invoice_date", "invoice_number",
    "line_items", "sgst", "subtotal", "total", "vendor_name",
  ]);
});

// --- key sealing -----------------------------------------------------------

process.env.SETTINGS_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
const { seal, unseal, maskKey } = await import("../lib/settings/crypto.ts");

const KEY = "sk-ant-api03-not-a-real-key-0000000000000000000000000000";

test("a key round trips through seal and unseal", () => {
  assert.equal(unseal("anthropic_api_key", seal("anthropic_api_key", KEY)), KEY);
});

test("the stored form gives nothing away", () => {
  const sealed = seal("anthropic_api_key", KEY);
  assert.equal(sealed.includes(KEY), false);
  assert.equal(sealed.startsWith("v1."), true);
  // Fresh IV every time, so the same key never stores as the same string.
  assert.notEqual(sealed, seal("anthropic_api_key", KEY));
});

test("unsealing fails rather than returning something wrong", () => {
  const sealed = seal("anthropic_api_key", KEY);
  const [v, iv, tag, body] = sealed.split(".");

  // Ciphertext moved to a different setting.
  assert.throws(() => unseal("openrouter_api_key", sealed));

  // Body edited.
  const flipped = Buffer.from(body, "base64url");
  flipped[0] ^= 0xff;
  assert.throws(() =>
    unseal("anthropic_api_key", [v, iv, tag, flipped.toString("base64url")].join(".")),
  );

  // Tag edited.
  const badTag = Buffer.from(tag, "base64url");
  badTag[0] ^= 0xff;
  assert.throws(() =>
    unseal("anthropic_api_key", [v, iv, badTag.toString("base64url"), body].join(".")),
  );

  // Not a sealed value at all.
  assert.throws(() => unseal("anthropic_api_key", "garbage"));
});

test("a different master key cannot open it", () => {
  const sealed = seal("anthropic_api_key", KEY);
  const original = process.env.SETTINGS_MASTER_KEY;
  process.env.SETTINGS_MASTER_KEY = Buffer.alloc(32, 9).toString("base64");
  assert.throws(() => unseal("anthropic_api_key", sealed));
  process.env.SETTINGS_MASTER_KEY = original;
  assert.equal(unseal("anthropic_api_key", sealed), KEY);
});

test("a master key of the wrong size is refused", () => {
  const original = process.env.SETTINGS_MASTER_KEY;
  process.env.SETTINGS_MASTER_KEY = Buffer.alloc(16, 1).toString("base64");
  assert.throws(() => seal("anthropic_api_key", KEY), /32 bytes/);
  delete process.env.SETTINGS_MASTER_KEY;
  assert.throws(() => seal("anthropic_api_key", KEY), /not set/);
  process.env.SETTINGS_MASTER_KEY = original;
});

test("the mask shows the last four and nothing else", () => {
  assert.equal(maskKey(KEY), "****" + KEY.slice(-4));
  assert.equal(maskKey("ab"), "****");
  assert.equal(maskKey(KEY).includes(KEY.slice(0, 8)), false);
});

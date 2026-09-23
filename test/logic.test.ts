// The three pieces of logic where a mistake would not announce itself:
// normalisation, match thresholds, arithmetic validation. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalize } from "../lib/items/normalize.ts";
import { parseExtraction, parseResponse, extractionJsonSchema } from "../lib/extract/schema.ts";

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
    ["amount past the column width", { ...valid, total: 1e307 }, /total/],
    ["quantity past the column width", { ...valid, line_items: [{ ...valid.line_items[0], quantity: 1e12 }] }, /quantity/],
  ];

  for (const [name, payload, expected] of cases) {
    const result = parseExtraction(payload);
    assert.equal(result.ok, false, `${name} should have failed`);
    assert.match(result.ok ? "" : result.error, expected, `${name} error text`);
  }
});

test("the provider JSON schema covers every field", () => {
  type Node = { properties?: Record<string, Node>; items?: Node };
  const top = extractionJsonSchema as Node;
  assert.deepEqual(Object.keys(top.properties ?? {}), ["reason", "is_invoice", "invoices"]);
  const found = top.properties?.invoices.items?.properties ?? {};
  assert.deepEqual(Object.keys(found), ["first_page", "last_page", "invoice"]);
  assert.deepEqual(Object.keys(found.invoice.properties ?? {}).sort(), [
    "cgst", "gstin", "igst", "invoice_date", "invoice_number",
    "line_items", "sgst", "subtotal", "total", "vendor_name",
  ]);
});

const at = (first_page: number, last_page: number, invoice = valid) => ({ first_page, last_page, invoice });

test("a file the model declines is not an invoice, not a failure", () => {
  const photo = { reason: "A product photo of a chocolate box.", is_invoice: false, invoices: [] };
  assert.deepEqual(parseResponse(photo, 1), {
    ok: false,
    notInvoice: true,
    reason: "A product photo of a chocolate box.",
  });
});

test("the verdict wins over invoices listed beside it", () => {
  const result = parseResponse({ reason: "A photo.", is_invoice: false, invoices: [at(1, 1)] }, 5);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.notInvoice, true);
});

test("every invoice in the file comes through, with its pages, in order", () => {
  const second = { ...valid, invoice_number: "INV-2" };
  const result = parseResponse({
    reason: "Two tax invoices.",
    is_invoice: true,
    invoices: [at(1, 2), at(3, 3, second)],
  }, 5);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.invoices.map((f) => [f.invoice.invoice_number, f.first_page, f.last_page]),
    [[valid.invoice_number, 1, 2], ["INV-2", 3, 3]],
  );
});

test("a yes with no invoices, a bad field or impossible pages is a failure, not a decline", () => {
  const empty = parseResponse({ reason: "A tax invoice.", is_invoice: true, invoices: [] }, 5);
  assert.equal("error" in empty, true);

  const bad = parseResponse({
    reason: "A tax invoice.",
    is_invoice: true,
    invoices: [at(1, 1, { ...valid, total: -1 })],
  }, 5);
  assert.match("error" in bad ? bad.error : "", /total/);

  const backwards = parseResponse({ reason: "A tax invoice.", is_invoice: true, invoices: [at(3, 2)] }, 5);
  assert.match("error" in backwards ? backwards.error : "", /before it starts/);

  const pageZero = parseResponse({ reason: "A tax invoice.", is_invoice: true, invoices: [at(0, 1)] }, 5);
  assert.equal("error" in pageZero, true);

  assert.equal(parseResponse({ is_invoice: false, invoices: [] }, 5).ok, false);
});

test("pages must fall inside the file that was read", () => {
  const past = parseResponse({ reason: "A tax invoice.", is_invoice: true, invoices: [at(5, 12)] }, 5);
  assert.match("error" in past ? past.error : "", /page 12, but the file has 5 pages/);

  const image = parseResponse({ reason: "A photo of a bill.", is_invoice: true, invoices: [at(2, 2)] }, 1);
  assert.match("error" in image ? image.error : "", /one page/);

  // Two small receipts on one page share it.
  const shared = parseResponse(
    { reason: "Two receipts.", is_invoice: true, invoices: [at(1, 1), at(1, 1, { ...valid, invoice_number: "R-2" })] },
    1,
  );
  assert.equal(shared.ok, true);
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

test("a truncated authentication tag is refused, not accepted weakly", () => {
  const [v, iv, tag, body] = seal("anthropic_api_key", KEY).split(".");

  // GCM will accept 4, 8, 12, 13, 14 and 15 byte tags. Every one of them is
  // weaker than the 16 byte tag seal produces, so all of them must be refused
  // rather than quietly lowering the bar for a forgery.
  for (const size of [4, 8, 12, 13, 14, 15]) {
    const short = Buffer.from(tag, "base64url").subarray(0, size);
    assert.throws(
      () => unseal("anthropic_api_key", [v, iv, short.toString("base64url"), body].join(".")),
      /authentication tag size/,
      `a ${size} byte tag should have been refused`,
    );
  }

  // A resized IV is the same class of problem.
  const shortIv = Buffer.from(iv, "base64url").subarray(0, 8);
  assert.throws(
    () => unseal("anthropic_api_key", [v, shortIv.toString("base64url"), tag, body].join(".")),
    /iv or authentication tag size/,
  );
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

// --- the model list --------------------------------------------------------

const { usable } = await import("../lib/extract/models.ts");

const entry = (over: Record<string, unknown> = {}) => ({
  id: "vendor/model",
  architecture: { input_modalities: ["text", "image", "file"] },
  supported_parameters: ["structured_outputs"],
  pricing: { prompt: "0.0000003", completion: "0.0000025" },
  ...over,
});

test("only models that can actually read an invoice are offered", () => {
  assert.equal(usable(entry()), true);

  // openrouter/free: images and structured output, but no PDFs. Selecting it
  // broke every PDF upload.
  assert.equal(usable(entry({ architecture: { input_modalities: ["text", "image"] } })), false);
  assert.equal(usable(entry({ architecture: { input_modalities: ["text", "file"] } })), false);
  assert.equal(usable(entry({ supported_parameters: [] })), false);
  // Queued rather than answered, and the cheapest rows in the catalogue.
  assert.equal(usable(entry({ id: "openai/gpt-5-nano:batch" })), false);
  // A router with no price of its own.
  assert.equal(usable(entry({ pricing: { prompt: "-1", completion: "-1" } })), false);
  // Free is fine, if it can do the job.
  assert.equal(usable(entry({ pricing: { prompt: "0", completion: "0" } })), true);
});

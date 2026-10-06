// Analytics is read from a phone and kept by a third party, so it gets codes and
// counts, never what a document said. These are the places content could leak.
import assert from "node:assert/strict";
import { test } from "node:test";

const { messageless, withoutQuery, scrubEvent } = await import("../lib/analytics/scrub.ts");

test("an error keeps its type and stack frames but loses its message", () => {
  const original = new TypeError("Acme Supplies invoice INV-2041 has no total");
  const safe = messageless(original);

  assert.equal(safe.name, "TypeError");
  assert.equal(safe.message, "");
  assert.doesNotMatch(safe.stack ?? "", /Acme|INV-2041/);
  assert.match(safe.stack ?? "", /^TypeError\n\s+at /);
});

test("a thrown non-error becomes a messageless error", () => {
  const safe = messageless("Acme Supplies");
  assert.equal(safe.message, "");
  assert.doesNotMatch(safe.stack ?? "", /Acme/);
});

test("a URL loses its query string and fragment", () => {
  assert.equal(withoutQuery("https://app.example/items?q=acme#row"), "https://app.example/items");
  assert.equal(withoutQuery("https://app.example/items"), "https://app.example/items");
  assert.equal(withoutQuery("/items?q=acme"), "/items");
  assert.equal(withoutQuery(undefined), undefined);
});

test("an outgoing event carries no query strings and no exception text", () => {
  const event = scrubEvent({
    event: "$exception",
    properties: {
      $current_url: "https://app.example/items?q=acme",
      $referrer: "https://app.example/vendors?q=acme",
      $exception_list: [{ type: "Error", value: "Acme Supplies INV-2041" }],
      invoices: 2,
    },
  });

  assert.equal(event?.properties.$current_url, "https://app.example/items");
  assert.equal(event?.properties.$referrer, "https://app.example/vendors");
  assert.deepEqual(event?.properties.$exception_list, [{ type: "Error", value: "" }]);
  assert.equal(event?.properties.invoices, 2);
});

test("a dropped event stays dropped", () => {
  assert.equal(scrubEvent(null), null);
});

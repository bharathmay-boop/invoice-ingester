// Events and their properties are one typed map, so a property outside the
// allowlist fails the build rather than reaching PostHog (#200). The
// ts-expect-error lines below are the test: if any of them stops being an
// error, `tsc --noEmit` fails.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { EventArgs, EventName, Events } from "../lib/analytics/events.ts";

function check<E extends EventName>(event: E, ...args: EventArgs<E>): E {
  void args;
  return event;
}

test("an allowed event with its allowed properties compiles", () => {
  assert.equal(check("invoice_saved", { line_items: 3, flagged: false, had_tax_id: true }), "invoice_saved");
  assert.equal(check("signed_in"), "signed_in");
});

test("anything off the list does not compile", () => {
  // @ts-expect-error: a vendor name is content, and not on the list.
  check("invoice_saved", { line_items: 3, flagged: false, had_tax_id: true, vendor_name: "Acme" });
  // @ts-expect-error: an event nobody named.
  check("invoice_viewed");
  // @ts-expect-error: a listed property left out.
  check("upload_extracted", { invoices: 2 });
  // @ts-expect-error: properties on an event that carries none.
  check("contract_reviewed", { contract_id: "7f74f3d7" });
  assert.ok(true);
});

test("every event name follows one shape", () => {
  const source = readFileSync("lib/analytics/events.ts", "utf8");
  const names = [...source.matchAll(/^  (\$?\w+): /gm)].map((m) => m[1]).filter((n) => n !== "$pageview");
  assert.ok(names.length >= 12);
  for (const name of names) assert.match(name, /^[a-z]+(_[a-z]+)*$/, name);
  const sample: keyof Events = "draft_discarded";
  assert.ok(sample);
});

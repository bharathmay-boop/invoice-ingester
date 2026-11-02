// Upload was measured; whether anyone then got an answer was not (#202).
// These events fire from the screens where the product pays off, with counts
// and codes only: a search sends how many results, never the term.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { impactBucket, linesByTag } from "../lib/analytics/value.ts";

test("an impact is sent as a band, never the amount", () => {
  assert.equal(impactBucket(null), "none");
  assert.equal(impactBucket(0), "none");
  assert.equal(impactBucket(60), "under_100");
  assert.equal(impactBucket(-60), "under_100", "a refund-sized difference is a size too");
  assert.equal(impactBucket(575), "100_to_1000");
  assert.equal(impactBucket(28377), "over_10000");
});

test("findings are counted per kind, across currencies", () => {
  const counts = linesByTag([
    { variance_tag: "billed_above_contract", lines: 6 },
    { variance_tag: "billed_above_contract", lines: 2 },
    { variance_tag: "not_in_contract", lines: 6 },
    { variance_tag: "something_new", lines: 1 },
  ]);
  assert.deepEqual(counts, {
    billed_above_contract: 8,
    billed_below_contract: 0,
    outside_contract_period: 0,
    not_in_contract: 6,
    units_differ: 0,
  });
});

const fires = (path: string, event: string) =>
  assert.match(readFileSync(path, "utf8"), new RegExp(`track\\("${event}"`), `${event} in ${path}`);

test("each event fires from the screen it belongs to, after the response", () => {
  fires("app/items/[id]/page.tsx", "item_viewed");
  fires("app/items/[id]/page.tsx", "price_chart_rendered");
  fires("app/vendors/[id]/page.tsx", "vendor_viewed");
  fires("app/items/page.tsx", "search_performed");
  fires("app/findings/layout.tsx", "findings_viewed");
  fires("app/findings/[lineId]/page.tsx", "finding_opened");
  fires("app/api/original/route.ts", "original_opened");
  const items = readFileSync("app/items/page.tsx", "utf8");
  assert.ok(!/search_performed"[^)]*\bq\b/.test(items), "the search term is sent");
});

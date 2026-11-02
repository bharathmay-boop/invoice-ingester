// The contract pipeline emitted one event, contract_reviewed, so nobody could
// say how many rates a contract produces, how often a quote fails to locate,
// or how often a worker dies (#201). Each event is typed in the map (so its
// properties are codes and counts by construction) and fired from its place.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const fires = (path: string, event: string) =>
  assert.match(readFileSync(path, "utf8"), new RegExp(`(track|capture)\\("${event}"`), `${event} in ${path}`);

test("each contract event fires where it happens", () => {
  fires("app/contracts/contract-dropzone.tsx", "contract_upload_started");
  fires("app/api/contracts/upload/route.ts", "contract_queued");
  fires("app/api/contracts/worker/route.ts", "contract_read");
  fires("app/api/contracts/worker/route.ts", "contract_read_failed");
  fires("app/api/contracts/sweep/route.ts", "contract_reclaimed");
  fires("app/contracts/[id]/page.tsx", "contract_review_opened");
  fires("app/contracts/[id]/review-actions.ts", "rate_confirmed");
});

test("a failure is sent as a code, never the message", () => {
  const worker = readFileSync("app/api/contracts/worker/route.ts", "utf8");
  for (const call of worker.matchAll(/track\("contract_read_failed"[^)]*\)/g)) {
    assert.ok(!/message|reason|error/.test(call[0]), call[0]);
  }
  const events = readFileSync("lib/analytics/events.ts", "utf8");
  assert.match(events, /failure: "refused" \| "not_a_contract" \| "read_failed" \| "crashed"/);
});

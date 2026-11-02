// PostHog loaded and wrote to the device before anyone was asked, which
// ePrivacy Article 5(3) does not allow (#175). It now starts storing nothing,
// and only an explicit Accept changes that.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CONSENT_KEY, currentChoice, recordChoice } from "../lib/analytics/consent.ts";

function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

test("nobody has chosen until they choose", () => {
  assert.equal(currentChoice(storage(), false), null);
  assert.equal(currentChoice(storage({ [CONSENT_KEY]: "not json" }), false), null);
});

test("a recorded choice is kept with when it was made", () => {
  const s = storage();
  recordChoice(s, "accepted", new Date("2026-11-02T10:00:00Z"));
  assert.deepEqual(JSON.parse(s.data.get(CONSENT_KEY)!), { choice: "accepted", at: "2026-11-02T10:00:00.000Z" });
  assert.equal(currentChoice(s, false), "accepted");
  recordChoice(s, "rejected");
  assert.equal(currentChoice(s, false), "rejected");
});

test("Global Privacy Control is a refusal, without asking, whatever was stored", () => {
  assert.equal(currentChoice(storage(), true), "rejected");
  const s = storage();
  recordChoice(s, "accepted");
  assert.equal(currentChoice(s, true), "rejected");
});

test("PostHog starts storing nothing, and only Accept upgrades it", () => {
  const provider = readFileSync("app/analytics-provider.tsx", "utf8");
  const init = provider.slice(provider.indexOf("posthog.init("), provider.indexOf("});", provider.indexOf("posthog.init(")));
  assert.match(init, /cookieless_mode: "on_reject"/);
  assert.match(init, /opt_out_capturing_by_default: true/);
  assert.match(init, /persistence: "memory"/);
  assert.match(init, /disable_session_recording: true/);
  assert.ok(!/localStorage\+cookie/.test(init), "persistent storage before a choice");
  assert.match(provider, /opt_in_capturing\(/);
});

test("Reject and Accept look the same, and there is a page saying what is set", () => {
  const banner = readFileSync("app/consent-banner.tsx", "utf8");
  const buttons = [...banner.matchAll(/<Button ([^\n]*?)onClick=\{\(\) => decide\("(rejected|accepted)"\)\}>/g)].map((m) => m[1].trim());
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0], buttons[1], "the two buttons differ in weight");
  assert.match(readFileSync("app/cookies/page.tsx", "utf8"), /sessionCookie\.name/);
});

// From the Kimi K2.5 review on #292.
const { applyChoice } = await import("../lib/analytics/consent.ts");

test("Accept turns tracking on only once the choice is recorded", () => {
  const calls: string[] = [];
  const effects = { accept: () => calls.push("accept"), reject: () => calls.push("reject") };
  assert.equal(applyChoice(storage(), "accepted", effects), true);
  assert.deepEqual(calls, ["accept"]);

  const blocked = { getItem: () => null, setItem: () => { throw new Error("storage blocked"); } };
  calls.length = 0;
  assert.equal(applyChoice(blocked, "accepted", effects), false);
  assert.deepEqual(calls, [], "tracking ran with nothing recorded");

  // Rejecting still takes effect, since it only removes things.
  assert.equal(applyChoice(blocked, "rejected", effects), false);
  assert.deepEqual(calls, ["reject"]);
});

test("accepting twice does not opt in twice", () => {
  const provider = readFileSync("app/analytics-provider.tsx", "utf8");
  const accept = provider.slice(provider.indexOf("export function acceptAnalytics"));
  assert.match(accept.slice(0, 400), /has_opted_in_capturing\(\)/);
  assert.match(readFileSync("app/consent-banner.tsx", "utf8"), /aria-live="polite"/);
});

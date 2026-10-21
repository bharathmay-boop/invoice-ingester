// Every animation on the public pages goes through one primitive, so the
// reduced motion rule lives in one place and is checked here (#236).
import assert from "node:assert/strict";
import { test } from "node:test";

import { revealMotion, SHOWN_WITHOUT_ANIMATION } from "../lib/reveal.ts";

test("a reduced motion visitor is forced visible and still by CSS, from the first paint", () => {
  // motion writes opacity and transform inline, so only !important beats it.
  assert.match(SHOWN_WITHOUT_ANIMATION, /motion-reduce:opacity-100!/);
  assert.match(SHOWN_WITHOUT_ANIMATION, /motion-reduce:transform-none!/);
});

test("a visitor without JavaScript still sees every section", () => {
  // The server renders the hidden starting state inline, and without scripts
  // nothing ever animates it in. Kimi K2.5 review on #252.
  assert.match(SHOWN_WITHOUT_ANIMATION, /noscript:opacity-100!/);
  assert.match(SHOWN_WITHOUT_ANIMATION, /noscript:transform-none!/);
});

test("everyone else gets a short fade up, once, as it enters the viewport", () => {
  const moving = revealMotion({ delay: 0.2 });
  assert.deepEqual(moving.initial, { opacity: 0, y: 12 });
  assert.deepEqual(moving.whileInView, { opacity: 1, y: 0 });
  assert.equal(moving.viewport.once, true);
  assert.equal(moving.transition.delay, 0.2);
  assert.ok(moving.transition.duration <= 0.5, "long enough to notice, short enough not to wait on");
});

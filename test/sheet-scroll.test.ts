// A section link in the phone menu closed the sheet but never scrolled: the
// modal sheet locks scrolling while it is open, and the jump was lost (#266).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { samePageSection } from "../app/nav-links.ts";

test("a section link on the home page is a scroll, anywhere else it is a navigation", () => {
  assert.equal(samePageSection("/#contracts", "/"), "contracts");
  assert.equal(samePageSection("/#how", "/"), "how");
  assert.equal(samePageSection("/#how", "/login"), null);
  assert.equal(samePageSection("/login", "/"), null);
});

// The nav is a client component that cannot load outside Next, so this holds
// the line that does the scroll: after the sheet has closed, not during.
test("the sheet scrolls to the section once it has closed", () => {
  const nav = readFileSync("app/nav.tsx", "utf8");
  assert.match(nav, /onCloseAutoFocus=/);
  assert.match(nav, /scrollIntoView/);
  // Focus follows the scroll, or the next Tab starts from the top of the page.
  assert.match(nav, /focus\(\{ preventScroll: true \}\)/);
  // From another page, the navigation waits for the sheet to close too.
  assert.match(nav, /router\.push\(href\)/);
});

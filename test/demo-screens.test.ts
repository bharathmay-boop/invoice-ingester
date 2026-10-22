// A demo visitor can look at everything and change nothing (#233), so every
// screen has to say so, and no control on it may look like it works (#234).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { linksFor } from "../app/nav-links.ts";

const hrefs = (role: Parameters<typeof linksFor>[0]) =>
  linksFor(role).map((l) => l.href);

test("the demo gets every screen it can read, and none it can only write to", () => {
  assert.deepEqual(hrefs(null), []);
  assert.ok(
    hrefs("owner").includes("/upload") && hrefs("owner").includes("/settings"),
  );
  assert.ok(
    !hrefs("demo").includes("/upload"),
    "upload only ever refuses a demo",
  );
  assert.ok(
    !hrefs("demo").includes("/settings"),
    "settings redirects a demo away",
  );
  assert.deepEqual(
    hrefs("demo"),
    hrefs("owner").filter((h) => h !== "/upload" && h !== "/settings"),
  );
});

// The rest is rendered by server components, which cannot run outside Next,
// so these hold the lines that connect them.
test("every screen shows the demo bar to a demo session, and only to one", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /role === "demo" && <DemoBar \/>/);
  assert.match(
    readFileSync("app/demo-bar.tsx", "utf8"),
    /Demo\. Invented data, read only\./,
  );
});

test("the two review screens are disabled, not live, for a demo session", () => {
  for (const page of [
    "app/review/[id]/page.tsx",
    "app/contracts/[id]/page.tsx",
  ]) {
    assert.match(
      readFileSync(page, "utf8"),
      /<fieldset disabled=\{demo\}/,
      page,
    );
  }
});

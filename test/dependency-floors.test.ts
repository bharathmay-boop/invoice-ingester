// Versions a known advisory rules out. A lockfile can quietly slide back below
// these when a dependency is re-resolved, so the floor is checked, not assumed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The lockfile, not node_modules: it is what the deploy installs from.
const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
  packages: Record<string, { version: string }>;
};

function atLeast(version: string, floor: string) {
  const [a, b] = [version, floor].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

test("sharp is past the librsvg advisory GHSA-wq5f-xc86-pv6w (#253)", () => {
  const { version } = lock.packages["node_modules/sharp"];
  assert.ok(atLeast(version, "0.35.5"), `sharp ${version} is below 0.35.5`);
});

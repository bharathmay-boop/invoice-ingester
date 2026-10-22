// Versions a known advisory rules out. A lockfile can quietly slide back below
// these when a dependency is re-resolved, so the floor is checked, not assumed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The lockfile, not node_modules: it is what the deploy installs from.
const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
  packages: Record<string, { version: string }>;
};

// A prerelease of the floor itself (0.35.5-rc.1) comes before it, so it does
// not count as fixed. Kimi K2.5 review on #258.
function atLeast(version: string, floor: string) {
  const [core, pre] = version.split("-");
  const [a, b] = [core, floor].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return pre === undefined;
}

test("the floor check reads versions the way npm does", () => {
  assert.equal(atLeast("0.35.5", "0.35.5"), true);
  assert.equal(atLeast("0.35.10", "0.35.5"), true);
  assert.equal(atLeast("0.36.0-beta.1", "0.35.5"), true);
  assert.equal(atLeast("0.35.4", "0.35.5"), false);
  assert.equal(atLeast("0.35.5-rc.1", "0.35.5"), false);
});

test("sharp is past the librsvg advisory GHSA-wq5f-xc86-pv6w (#253)", () => {
  const sharp = lock.packages["node_modules/sharp"];
  assert.ok(sharp, "sharp is not at the top of the lockfile; check where it moved");
  assert.ok(atLeast(sharp.version, "0.35.5"), `sharp ${sharp.version} is below 0.35.5`);
});

test("next is past the remote code execution advisories GHSA-2464-fhr4-w9xw and GHSA-673q-mjm6-r5xr (#260)", () => {
  const next = lock.packages["node_modules/next"];
  assert.ok(next, "next is not at the top of the lockfile; check where it moved");
  assert.ok(atLeast(next.version, "16.4.2"), `next ${next.version} is below 16.4.2`);
});

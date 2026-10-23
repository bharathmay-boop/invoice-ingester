// Anything a visitor reads on the public pages follows the house rule for
// public text: no em dashes and none of the words that mark copy as generated
// (#245). Comments are stripped first, since they are not shown.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { dirname, join, normalize } from "node:path";

// Every file a visitor's page is built from, found by following relative
// imports from the public entry points, so a new section is checked the day
// it is added. A fixed list missed six files within two days (#269).
const ENTRY_POINTS = ["app/page.tsx", "app/login/page.tsx", "app/layout.tsx"];

function publicFiles(): string[] {
  const seen = new Set<string>();
  const queue = [...ENTRY_POINTS];
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const [, spec] of source.matchAll(/from ['"](\.{1,2}\/[^'"]+\.tsx?)['"]/g)) {
      const next = normalize(join(dirname(file), spec)).replaceAll("\\", "/");
      if (next.startsWith("app/")) queue.push(next);
    }
  }
  return [...seen].sort();
}

const PUBLIC_FILES = publicFiles();

const BANNED_WORDS = ["seamless", "robust", "leverage", "elevate", "game-changer", "game changer", "dive into", "delve"];

/** Source with comments removed. ponytail: a regex, not a parser; a URL with // in a string would be cut, which only loosens the check. */
function stripComments(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

test("no em dash reaches a visitor", () => {
  for (const path of PUBLIC_FILES) {
    const source = stripComments(readFileSync(path, "utf8"));
    assert.ok(!/—|&mdash;|\u2014/.test(source), `${path} has an em dash outside a comment`);
  }
});

test("none of the generated-copy words reach a visitor", () => {
  for (const path of PUBLIC_FILES) {
    const source = stripComments(readFileSync(path, "utf8")).toLowerCase();
    for (const word of BANNED_WORDS) {
      assert.ok(!source.includes(word), `${path} says "${word}"`);
    }
  }
});

test("every section and control a visitor sees is checked", () => {
  for (const file of [
    "app/contracts-section.tsx",
    "app/limits.ts",
    "app/limits-section.tsx",
    "app/try-demo.tsx",
    "app/nav.tsx",
    "app/demo-bar.tsx",
    "app/home-walkthrough.tsx",
    "app/what-it-answers.tsx",
  ]) {
    assert.ok(PUBLIC_FILES.includes(file), `${file} is not checked`);
  }
});

test("the comment stripping does not hide real copy", () => {
  // Guards the guard: an em dash in visible text must still be caught.
  const sample = 'const a = "x — y"; // fine — here\n/* and — here */';
  const stripped = stripComments(sample);
  assert.ok(stripped.includes("—"), "visible em dash was stripped");
  assert.ok(!stripped.includes("fine"), "comment survived");
});

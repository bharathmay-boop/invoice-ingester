// "Invented figures" was said four times on the home page, and repetition
// reads as nervousness. Once near the hero, once in the footer (#244).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** Visible text only: comments are not shown. */
function visible(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

test("the home page says its figures are invented twice: by the hero and in the footer", () => {
  const files = ["app/page.tsx", "app/home-walkthrough.tsx", "app/what-it-answers.tsx", "app/contracts-section.tsx", "app/limits-section.tsx", "app/flow-hero.tsx"];
  const mentions = files.flatMap((f) => [...visible(f).matchAll(/\binvented\b/gi)].map(() => f));
  assert.deepEqual(mentions, ["app/page.tsx", "app/page.tsx"]);
});

test("the closing card is a way into the demo, not another disclaimer", () => {
  const page = visible("app/page.tsx");
  const closing = page.slice(page.lastIndexOf("{!signedIn && ("), page.indexOf("<footer"));
  assert.match(closing, /<TryDemo/);
  assert.ok(!/invented/i.test(closing));
});

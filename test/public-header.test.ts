// The signed out header is how a visitor from an outreach email finds their
// way around the home page and into the demo (#237).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { PUBLIC_LINKS } from "../app/nav-links.ts";

const home = readFileSync("app/page.tsx", "utf8");

// The home page and the section components it imports from app/, since a
// section can live in its own file (#240).
// Either quote, and a file in a subfolder of app/. Kimi K2.5 review on #265.
const IMPORTED = /from ['"]\.\/([\w/-]+\.tsx)['"]/g;
const rendered = [
  home,
  ...[...home.matchAll(IMPORTED)].map((m) => readFileSync(`app/${m[1]}`, "utf8")),
].join("\n");

test("the section file finder reads the imports however they are written", () => {
  const found = (source: string) => [...source.matchAll(IMPORTED)].map((m) => m[1]);
  assert.deepEqual(found(`import { A } from "./a.tsx";`), ["a.tsx"]);
  assert.deepEqual(found(`import { B } from './b.tsx';`), ["b.tsx"]);
  assert.deepEqual(found(`import { C } from "./sections/c.tsx";`), ["sections/c.tsx"]);
});

test("every section link in the header lands on a section that exists", () => {
  assert.ok(PUBLIC_LINKS.length > 0);
  for (const link of PUBLIC_LINKS) {
    const id = link.href.split("#")[1];
    assert.ok(id, `${link.href} is not a section link`);
    assert.match(rendered, new RegExp(`id="${id}"`), `no section with id ${id}`);
  }
});

// Nav and home are client and server components that cannot load outside
// Next, so these hold the lines that put the demo in front of a visitor.
test("the signed out header and the hero both open the demo in one click", () => {
  const nav = readFileSync("app/nav.tsx", "utf8");
  assert.match(nav, /<TryDemo/);
  assert.match(nav, /<SheetTrigger/, "the links collapse into a sheet on a phone");
  assert.match(home, /<TryDemo/);
  assert.ok(!home.includes("holds real invoices"), "production holds only the demo");
});

test("the full row of header links only appears once it fits on one line", () => {
  // Five section links, GitHub, Sign in and the demo button wrapped onto two
  // rows between 640px and 1023px, so the sheet stays until lg (#242).
  const nav = readFileSync("app/nav.tsx", "utf8");
  const publicLinks = nav.slice(nav.indexOf("function PublicLinks"), nav.indexOf("export function Nav"));
  assert.ok(!/\bsm:(flex|hidden)\b/.test(publicLinks), "the row switches at sm again");
  assert.match(publicLinks, /\blg:flex\b/);
  assert.match(publicLinks, /\blg:hidden\b/);
});

// The signed out header is how a visitor from an outreach email finds their
// way around the home page and into the demo (#237).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { PUBLIC_LINKS } from "../app/nav-links.ts";

const home = readFileSync("app/page.tsx", "utf8");

// The home page and the section components it imports from app/, since a
// section can live in its own file (#240).
const rendered = [
  home,
  ...[...home.matchAll(/from "\.\/([\w-]+\.tsx)"/g)].map((m) => readFileSync(`app/${m[1]}`, "utf8")),
].join("\n");

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

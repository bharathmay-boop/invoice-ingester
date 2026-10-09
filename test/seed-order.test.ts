// lib/db.ts builds its connection pool the moment it is first imported, from
// whatever DATABASE_URL is then. The seed prefers the unpooled URL and copies
// it into DATABASE_URL, so anything that reaches db.ts has to be imported after
// that line or it keeps a pool with no URL, or with another database.
//
// This was broken once (#157): the matcher imports landed above the
// assignment, the inserts committed, and the later variance pass ran against a
// pool that was not the seed database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("scripts/seed.mjs", "utf8");

// Modules that reach lib/db.ts, directly or through the settings store.
const REACHES_DB = [
  "../lib/items/save-line.ts",
  "../lib/items/match.ts",
  "../lib/contracts/recompute.ts",
  "../lib/settings/store.ts",
  "../lib/db.ts",
];

test("every import that reaches the database comes after DATABASE_URL is set", () => {
  const assignment = source.indexOf("process.env.DATABASE_URL = url;");
  assert.ok(assignment > 0, "the seed copies its chosen URL into DATABASE_URL");

  for (const path of REACHES_DB) {
    const at = source.indexOf(`import("${path}")`);
    if (at === -1) continue; // not every module is imported by every version of the seed
    assert.ok(at > assignment, `${path} is imported before DATABASE_URL is set`);
  }
});

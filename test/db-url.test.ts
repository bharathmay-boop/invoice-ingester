import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { verifyFull } from "../lib/db-url.ts";

const base = "postgres://user:pw@host.example/db";

test("modes pg 9 will weaken are stated as verify-full", () => {
  for (const mode of ["require", "prefer", "verify-ca"]) {
    assert.equal(verifyFull(`${base}?sslmode=${mode}`), `${base}?sslmode=verify-full`);
  }
  assert.equal(
    verifyFull(`${base}?channel_binding=require&sslmode=require`),
    `${base}?channel_binding=require&sslmode=verify-full`,
  );
});

test("everything else is left alone", () => {
  for (const url of [
    `${base}?sslmode=verify-full`,
    `${base}?sslmode=disable`,
    "postgres://localhost/db",
    `${base}?application_name=sslmode=require`,
  ]) {
    assert.equal(verifyFull(url), url);
  }
  assert.equal(verifyFull(undefined), undefined);
});

test("every place that opens a connection goes through it", () => {
  for (const file of [
    "lib/db.ts",
    "scripts/migrate.mjs",
    "scripts/seed.mjs",
    "scripts/rekey-vendors.mjs",
    "scripts/backfill-originals.mjs",
  ]) {
    assert.match(readFileSync(file, "utf8"), /connectionString: verifyFull\(/, file);
  }
});

test("the node floor is one that runs TypeScript scripts unflagged", () => {
  // The scripts import lib/*.ts directly. Node strips types without a flag from
  // 22.18, and an older one fails with ERR_UNKNOWN_FILE_EXTENSION before connecting.
  const { engines } = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(engines.node, ">=22.18");
});

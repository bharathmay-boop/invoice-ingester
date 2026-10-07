// The screenshot run photographs authenticated screens and the images are
// committed to a public repository, so both of its refusals are tested. A guard
// nobody checks is a guard that stops working quietly.
import assert from "node:assert/strict";
import test from "node:test";
import { isLocalOrigin, realRows } from "../scripts/screenshot-guards.mjs";

test("the pictures may only come from this machine", () => {
  for (const base of [
    "http://localhost:3000",
    "http://localhost",
    "https://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ]) {
    assert.equal(isLocalOrigin(base), true, base);
  }
});

test("a host that merely starts with localhost is somebody else's machine", () => {
  // The reason this is a URL parse rather than a prefix test. Every one of these
  // begins with the right letters and resolves somewhere else.
  for (const base of [
    "https://invoice-ingester.vercel.app",
    "http://localhost.evil.com",
    "http://localhost.evil.com:3000/",
    "http://127.0.0.1.evil.com/",
    "http://user@evil.com/localhost",
    "https://evil.com/?x=http://localhost:3000",
    "not a url",
    "",
  ]) {
    assert.equal(isLocalOrigin(base), false, base);
  }
});

test("a database with nothing but demo rows is the only one that may be photographed", () => {
  assert.deepEqual(
    realRows({ vendors: 0, items: 0, invoices: 0, contracts: 0 }),
    [],
  );
});

test("every table holding real rows is named, not just the first", () => {
  // Named rather than counted, because "3 tables have real rows" tells the
  // person running this nothing about which database they are pointed at.
  assert.deepEqual(
    realRows({ vendors: 2, items: 0, invoices: 13, contracts: 0 }),
    [
      ["vendors", 2],
      ["invoices", 13],
    ],
  );
});

// Response headers that every page and route carries. A missing one is silent:
// the app works the same, and the protection is simply not there.
import assert from "node:assert/strict";
import { test } from "node:test";

const { default: config } = await import("../next.config.ts");

const rules = (await config.headers?.()) ?? [];

function headersFor(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) {
    const pattern = new RegExp(`^${rule.source.replace(/:path\*/, ".*")}$`);
    if (pattern.test(path)) for (const h of rule.headers) out[h.key.toLowerCase()] = h.value;
  }
  return out;
}

test("every page refuses to be framed by another site", () => {
  for (const path of ["/", "/settings", "/review/1"]) {
    const h = headersFor(path);
    assert.equal(h["x-frame-options"], "SAMEORIGIN", path);
    assert.match(h["content-security-policy"] ?? "", /frame-ancestors 'self'/, path);
  }
});

test("browsers are told not to guess content types and to stay on HTTPS", () => {
  for (const path of ["/", "/api/original"]) {
    const h = headersFor(path);
    assert.equal(h["x-content-type-options"], "nosniff", path);
    assert.match(h["strict-transport-security"] ?? "", /max-age=\d{8,}/, path);
    assert.equal(h["referrer-policy"], "strict-origin-when-cross-origin", path);
  }
});

// Which address the login limiter counts against. If a caller can choose it,
// they get a fresh allowance per request, or can lock the owner out.
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SETTINGS_MASTER_KEY ??= Buffer.alloc(32, 9).toString("base64");
const { clientAddress } = await import("../lib/rate-limit.ts");

const from = (headers: Record<string, string>) => new Request("http://localhost/api/session", { headers });

function onVercel(value: string | undefined, run: () => void) {
  const saved = process.env.VERCEL;
  try {
    if (value === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = value;
    run();
  } finally {
    if (saved === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = saved;
  }
}

test("on Vercel, the address is the one Vercel's edge wrote", () => {
  // Vercel overwrites X-Forwarded-For and does not forward a client's own value.
  onVercel("1", () => {
    assert.equal(clientAddress(from({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
    assert.equal(clientAddress(from({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
  });
});

test("off Vercel, a forwarded header cannot choose the bucket", () => {
  // Nothing in front of the app is known to overwrite it, so a header the
  // caller writes would buy a fresh allowance per request.
  onVercel(undefined, () => {
    const a = clientAddress(from({ "x-forwarded-for": "203.0.113.9" }));
    const b = clientAddress(from({ "x-forwarded-for": "198.51.100.7", "x-real-ip": "198.51.100.8" }));
    assert.equal(a, b);
  });
});

// The cron secret is what stands between the internet and the paid contract
// reader, so its check and where it gets sent are tested on their own.
import assert from "node:assert/strict";
import { test } from "node:test";

const { isCronRequest, workerUrl } = await import("../lib/contracts/cron.ts");

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const saved = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    run();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("only the exact bearer secret is accepted", () => {
  withEnv({ CRON_SECRET: "a-long-random-test-secret" }, () => {
    assert.equal(isCronRequest("Bearer a-long-random-test-secret"), true);
    for (const wrong of [
      null,
      "",
      "Bearer",
      "Bearer ",
      "bearer a-long-random-test-secret",
      "Bearer a-long-random-test-secre",
      "Bearer a-long-random-test-secretX",
      "a-long-random-test-secret",
    ]) {
      assert.equal(isCronRequest(wrong), false, String(wrong));
    }
  });
});

test("nothing is accepted when the secret is not set", () => {
  withEnv({ CRON_SECRET: undefined }, () => {
    assert.equal(isCronRequest("Bearer undefined"), false);
    assert.equal(isCronRequest("Bearer "), false);
  });
});

test("the worker is called on this deployment's own address, not the request's Host", () => {
  withEnv(
    { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "invoices.example", VERCEL_URL: "abc.vercel.app" },
    () => assert.equal(workerUrl("https://attacker.example").href, "https://invoices.example/api/contracts/worker"),
  );
  withEnv(
    { VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "invoices.example", VERCEL_URL: "abc.vercel.app" },
    () => assert.equal(workerUrl("https://attacker.example").href, "https://abc.vercel.app/api/contracts/worker"),
  );
});

test("off Vercel, the worker is called on the origin the request came in on", () => {
  withEnv({ VERCEL_ENV: undefined, VERCEL_PROJECT_PRODUCTION_URL: undefined, VERCEL_URL: undefined }, () =>
    assert.equal(workerUrl("http://localhost:3000").href, "http://localhost:3000/api/contracts/worker"),
  );
});

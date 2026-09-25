// What someone is told when an upload does not work. Every one of these will
// happen, and "extraction failed" answers none of them.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  describeStatus,
  describeTimeout,
  describeUnreachable,
  describeUnusable,
  isRetryableStatus,
  isTimeout,
  withOneRetry,
} from "../lib/extract/failure.ts";

test("only a busy or broken provider is worth trying again", () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert.equal(isRetryableStatus(status), true, String(status));
  }
  // A rejected key gives the same answer the second time, slower. A refusal
  // costs money to be told the same thing.
  for (const status of [400, 401, 402, 403, 404, 413, 422]) {
    assert.equal(isRetryableStatus(status), false, String(status));
  }
});

test("each failure says what to do next", () => {
  assert.match(describeStatus("OpenRouter", 401).message, /Replace it in settings/);
  assert.match(describeStatus("OpenRouter", 402).message, /out of credit/);
  assert.match(describeStatus("OpenRouter", 413).message, /Split the PDF/);
  assert.match(describeStatus("OpenRouter", 429).message, /wait a minute/i);
  assert.match(describeStatus("OpenRouter", 503).message, /their end/);
  assert.match(describeTimeout("OpenRouter").message, /faster model/);
  assert.match(describeUnreachable("OpenRouter").message, /connection/);
  assert.match(describeUnusable("nothing").message, /another model/);
  assert.match(describeUnusable("not_json").message, /another model/);
});

test("no message names a key, a token or a provider's own error body", () => {
  const all = [
    ...[401, 402, 413, 429, 500].map((s) => describeStatus("OpenRouter", s).message),
    describeTimeout("OpenRouter").message,
    describeUnreachable("OpenRouter").message,
    describeUnusable("nothing").message,
  ];
  for (const message of all) {
    assert.doesNotMatch(message, /sk-|Bearer|api[_-]?key=/i, message);
  }
});

test("a retryable failure is tried exactly twice, and no more", async () => {
  let calls = 0;
  const result = await withOneRetry(
    async () => {
      calls += 1;
      return { status: 503 };
    },
    (r) => isRetryableStatus(r.status),
    0,
  );
  assert.equal(calls, 2, "once, then once more");
  assert.equal(result.status, 503, "and the second answer is the one returned");
});

test("a success is not retried, and neither is a rejected key", async () => {
  for (const status of [200, 401]) {
    let calls = 0;
    await withOneRetry(
      async () => {
        calls += 1;
        return { status };
      },
      (r) => isRetryableStatus(r.status),
      0,
    );
    assert.equal(calls, 1, String(status));
  }
});

test("a recovered call returns the second answer", async () => {
  const answers = [{ status: 429 }, { status: 200 }];
  const result = await withOneRetry(
    async () => answers.shift()!,
    (r) => isRetryableStatus(r.status),
    0,
  );
  assert.equal(result.status, 200);
});

test("an aborted call is recognised as a timeout", () => {
  assert.equal(isTimeout(new DOMException("timed out", "TimeoutError")), true);
  assert.equal(isTimeout(new DOMException("aborted", "AbortError")), true);
  assert.equal(isTimeout(new Error("something else")), false);
  assert.equal(isTimeout(null), false);
});

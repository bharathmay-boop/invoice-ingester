/**
 * What went wrong, in words that say what to do next.
 *
 * Every one of these will happen: a key gets revoked, credit runs out, a
 * provider has a bad minute, a model returns something that is not an invoice.
 * "Extraction failed" tells someone none of that, and a stack trace tells them
 * less.
 */

export type Failure = {
  /** Shown to the person who uploaded the file. */
  message: string;
  /** Worth trying again by itself: the same request may work in a moment. */
  retryable: boolean;
};

/** Long enough for a slow model on a long PDF, short enough to not hang. */
export const CALL_TIMEOUT_MS = 90_000;

/**
 * Only two kinds of failure are worth retrying: the provider was busy, or it
 * was briefly broken. Retrying a rejected key just spends another minute
 * arriving at the same answer, and retrying a refusal spends money to be told
 * the same thing.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function describeStatus(provider: string, status: number): Failure {
  if (status === 401 || status === 403) {
    return {
      message: `${provider} rejected that key. Replace it in settings, and check the key has not been revoked.`,
      retryable: false,
    };
  }
  if (status === 402) {
    return {
      message: `${provider} says the account is out of credit. Top it up and try again.`,
      retryable: false,
    };
  }
  if (status === 413) {
    return {
      message: "The file was too large for the model. Split the PDF and upload the parts.",
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      message: `${provider} is rate limiting this key. It was tried twice; wait a minute and upload again.`,
      retryable: true,
    };
  }
  if (status >= 500) {
    return {
      message: `${provider} had a problem at their end (${status}). It was tried twice; try again shortly.`,
      retryable: true,
    };
  }
  return {
    message: `${provider} refused the request (${status}). Nothing was charged for it.`,
    retryable: false,
  };
}

/** A call that never came back, as opposed to one that came back badly. */
export function describeTimeout(provider: string): Failure {
  return {
    message: `${provider} did not answer within ${Math.round(
      CALL_TIMEOUT_MS / 1000,
    )} seconds. It was tried twice; try again, or pick a faster model in settings.`,
    retryable: true,
  };
}

export function describeUnreachable(provider: string): Failure {
  return {
    message: `Could not reach ${provider}. Check the connection and try again.`,
    retryable: true,
  };
}

/**
 * The model answered, but not with an invoice. Usually the wrong model for the
 * job, which is a settings problem rather than a retry.
 */
export function describeUnusable(what: "nothing" | "not_json" | "invalid", detail?: string): Failure {
  if (what === "nothing") {
    return {
      message:
        "The model returned no invoice fields at all. Try another model in settings: not every model can hold to a schema.",
      retryable: false,
    };
  }
  if (what === "not_json") {
    return {
      message:
        "The model did not return JSON. Try another model in settings: this one cannot keep to the required format.",
      retryable: false,
    };
  }
  return {
    message: `The extracted fields did not validate.${detail ? `\n${detail}` : ""}`,
    retryable: false,
  };
}

/**
 * Runs a call once, and once more if the first failure was the kind that
 * passes. One retry, not a loop: a second failure of the same sort means the
 * provider is having a bad minute, and hammering it is neither polite nor
 * faster than telling someone to come back.
 */
export async function withOneRetry<T>(
  call: () => Promise<T>,
  shouldRetry: (result: T) => boolean,
  pauseMs = 1500,
): Promise<T> {
  const first = await call();
  if (!shouldRetry(first)) return first;
  await new Promise((resolve) => setTimeout(resolve, pauseMs));
  return call();
}

/** An aborted fetch, whatever the runtime chose to call it. */
export function isTimeout(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

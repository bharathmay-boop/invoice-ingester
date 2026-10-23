/**
 * The figures on the home page's "how it was built" strip, in one place, so
 * they are updated on purpose rather than drifting in several (#243). A test
 * fails if the test count is ever higher than the suite's real one.
 */
export const BUILD_STATS = {
  asOf: "2026-10-23",
  tests: 458,
  testFiles: 59,
  pullRequests: 94,
  issuesClosed: 121,
} as const;

export const BOARD_URL = "https://github.com/users/bharathmay-boop/projects/1";

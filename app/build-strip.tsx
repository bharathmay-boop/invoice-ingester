import { Reveal } from "@/components/reveal.tsx";
import { BOARD_URL, BUILD_STATS } from "./build-stats.ts";
import { SOURCE_URL } from "./nav-links.ts";

/**
 * How it was built, in four numbers and two links. The board, the tests and
 * the reviewed pull requests are the evidence, and until now they were one
 * footer link away (#243).
 */
export function BuildStrip() {
  const asOf = new Date(`${BUILD_STATS.asOf}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const figures = [
    { value: BUILD_STATS.tests, label: "tests" },
    { value: BUILD_STATS.testFiles, label: "test files" },
    { value: BUILD_STATS.pullRequests, label: "pull requests merged" },
    { value: BUILD_STATS.issuesClosed, label: "issues closed" },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <Reveal>
        <div className="border-border bg-muted/40 rounded-xl border p-6">
          <h2 className="text-lg font-semibold tracking-tight">How it was built</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
            The work is planned as issues on a public board and lands as pull requests, with the
            tests and review comments there to read.
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {figures.map((figure) => (
              <div key={figure.label}>
                <dt className="text-muted-foreground text-xs">{figure.label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{figure.value}</dd>
              </div>
            ))}
          </dl>

          <p className="text-muted-foreground mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <a href={BOARD_URL} className="text-foreground underline underline-offset-4">
              The issue board
            </a>
            <a href={SOURCE_URL} className="text-foreground underline underline-offset-4">
              The source
            </a>
            <span className="text-xs">Counted on {asOf}.</span>
          </p>
        </div>
      </Reveal>
    </section>
  );
}

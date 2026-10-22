/**
 * The steps How it works walks through, kept apart from the component so a
 * test can hold them: the component is a client one and cannot load outside
 * Next (#238).
 *
 * Read and Check are what any extraction tool does. Match and Contract are
 * what this one adds, so the walkthrough stops short without them.
 */
export const STEPS = ["Read", "Check", "Match", "Contract"] as const;

/**
 * How long the nth row of a panel waits before fading in. A row is invisible
 * while it waits, so this stays short enough that no panel ever shows an
 * empty box to someone scrolling past.
 */
export function rowDelay(index: number): number {
  return Math.min(0.1 + index * 0.1, 0.4);
}

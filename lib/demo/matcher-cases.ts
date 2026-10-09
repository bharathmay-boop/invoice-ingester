import { build, type SeedInvoice } from "./dataset.ts";
import { normalize } from "../items/normalize.ts";

/**
 * The lines that show the matcher making a judgement (#157).
 *
 * Every line in the main demo set is already matched, so the suggestion queue
 * was empty, nothing showed the matcher deciding anything, and the alias
 * mechanism had nothing demonstrating it. A catalogue that looks hand entered
 * is the opposite of the point.
 *
 * These are kept out of `invoices` on purpose. They are not seeded as decided
 * matches: the seed runs each one through the real matcher, so the scores on
 * screen come from Postgres trigram similarity and not from numbers typed
 * here. `expect` is only what the test holds the matcher to, so that a change
 * to the normaliser or the thresholds that quietly empties the queue again
 * fails loudly instead.
 *
 * The scores were probed against the demo catalogue at the default thresholds
 * (link 0.85, suggest 0.6) and are noted beside each line.
 */
export type MatcherExpectation = "linked" | "suggested" | "new";

export type MatcherCase = {
  description: string;
  expect: MatcherExpectation;
  /** The catalogue item it should land on or be offered, by display name. */
  item: string | null;
  why: string;
};

export const CASES: MatcherCase[] = [
  {
    description: "Black Whiteboard Markers",
    expect: "linked",
    item: "Whiteboard Marker Black",
    why: "A confident match that is right: scores about 0.88, so it links without anyone being asked.",
  },
  {
    description: "Stapler HD45",
    expect: "suggested",
    item: "Stapler HD-45",
    why: "The same product with the hyphen dropped, about 0.69. Under the link threshold, so it waits in the queue.",
  },
  {
    description: "Pen Ballpoint Blue Smooth",
    expect: "suggested",
    item: "Ballpoint Pen Blue (Pack of 10)",
    why: "A near miss that might be a different pen, about 0.72. Exactly what the queue is for.",
  },
  {
    description: "Hydraulic Floor Jack 2 Tonne",
    expect: "new",
    item: null,
    why: "Nothing in the catalogue resembles it, so the answer is a new item rather than a match.",
  },
  {
    description: "B/P PEN BLUE 10S",
    expect: "linked",
    item: "Ballpoint Pen Blue (Pack of 10)",
    why:
      "Scores only about 0.38 against the catalogue on its own. Somebody taught the matcher this name once, " +
      "so it links through the alias.",
  },
];

/** Names taught to the matcher: the alias, and the catalogue item it means. */
export const ALIASES = [{ alias: "B/P PEN BLUE 10S", item: "Ballpoint Pen Blue (Pack of 10)" }];

/**
 * Where they arrive: a supplier with no contract, so these lines add no
 * findings and leave the contract story in the main set untouched.
 */
export const matcherInvoice: SeedInvoice = build({
  gstin: "07AAGCS9012H1Z8",
  number: "SPB/0914",
  date: "2026-09-20",
  lines: CASES.map((c) => ({
    description: c.description,
    itemCode: null,
    quantity: 4,
    unit: "nos",
    unitPrice: 120,
  })),
});

export const normalizedAlias = (alias: string) => normalize(alias);

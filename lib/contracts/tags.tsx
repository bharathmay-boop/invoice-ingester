import type { Tag } from "./variance.ts";

/**
 * What each tag is called on screen, and whether it has money behind it.
 *
 * The split matters more than the labels. Three of these have a figure and sort
 * by it; four cannot have one, because there is no agreed rate to compare
 * against, or no way to convert between the units, or the two sides are in
 * different currencies. Showing the second group as zero would sort them to the
 * bottom pretending they were worthless.
 */
export const TAGS: Record<Tag, { label: string; valued: boolean; tone: "bad" | "soft" | "good" }> = {
  billed_above_contract: { label: "Billed above contract", valued: true, tone: "bad" },
  billed_below_contract: { label: "Billed below contract", valued: true, tone: "soft" },
  not_in_contract: { label: "Not in contract", valued: true, tone: "bad" },
  outside_contract_period: { label: "Outside contract period", valued: false, tone: "soft" },
  units_differ: { label: "Units differ", valued: false, tone: "soft" },
  currency_differs: { label: "Currency differs", valued: false, tone: "soft" },
  matches_contract: { label: "Matches contract", valued: true, tone: "good" },
};

export const TONE: Record<"bad" | "soft" | "good", string> = {
  bad: "bg-amber-500/20 text-amber-900 dark:text-amber-200",
  soft: "bg-black/10 dark:bg-white/15",
  good: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
};

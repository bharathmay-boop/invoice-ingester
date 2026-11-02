/**
 * Shapes for the events on the screens where the product pays off (#202):
 * an amount becomes a band and findings become counts, so neither a figure
 * nor a supplier ever reaches analytics.
 */

export type ImpactBand = "none" | "under_100" | "100_to_1000" | "1000_to_10000" | "over_10000";

/** How much a finding is worth, in its currency's units, as a band. */
export function impactBucket(impact: number | null): ImpactBand {
  const size = Math.abs(impact ?? 0);
  if (size === 0) return "none";
  if (size < 100) return "under_100";
  if (size < 1000) return "100_to_1000";
  if (size < 10000) return "1000_to_10000";
  return "over_10000";
}

export const FINDING_TAGS = [
  "billed_above_contract",
  "billed_below_contract",
  "outside_contract_period",
  "not_in_contract",
  "units_differ",
] as const;

export type FindingCounts = Record<(typeof FINDING_TAGS)[number], number>;

/** Lines per kind of finding, summed across currencies; an unknown tag is left out. */
export function linesByTag(totals: { variance_tag: string; lines: number }[]): FindingCounts {
  const counts = Object.fromEntries(FINDING_TAGS.map((tag) => [tag, 0])) as FindingCounts;
  for (const row of totals) {
    if (row.variance_tag in counts) counts[row.variance_tag as keyof FindingCounts] += row.lines;
  }
  return counts;
}

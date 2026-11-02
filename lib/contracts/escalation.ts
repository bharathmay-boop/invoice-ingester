/**
 * Checking an expanded escalation against the rule it came from (#153).
 *
 * The model writes an escalation out as one rate per period, and nothing
 * checked that arithmetic: simple interest where compound was meant, or a
 * rise applied from the wrong anniversary, both give a rate card that looks
 * entirely ordinary. Where the contract states a yearly percentage, each
 * item's later rates are derived again from its earliest one and compared.
 *
 * A mismatch is shown, never corrected. A contract can state a rule and a
 * table that disagree, and a figure changed while a reviewer checks it
 * against the page is how a wrong number becomes invisible.
 */

type Term = { kind: string; summary: string; quote: string | null };
type Rate = { printed_name: string; rate: number; effective_from: string | Date | null };

export type EscalationMismatch = {
  printed_name: string;
  effective_from: string;
  read: number;
  expected: number;
  /** The words the rule was read from, so the reviewer can check it too. */
  quote: string | null;
};

const WORD_PERCENT: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/**
 * A yearly percentage rise stated in a contract's words, as a fraction, or
 * null when the words do not state one plainly: an index link, a one-off rise
 * or anything without a yearly cadence is left alone rather than guessed at.
 */
export function statedYearlyRise(text: string): number | null {
  // Sentence by sentence, so a late payment charge in one sentence is not
  // read as the yearly rise in the next (Kimi K2.5 review on #290). A full
  // stop between digits is a decimal point, not a sentence end.
  for (const sentence of text.toLowerCase().split(/(?<!\d)\.(?!\d)|[;\n]/)) {
    const yearly = /\b(each|every)\s+(year|1st|first|\d{1,2}(st|nd|rd|th)?\s+\w+)|\bannual(ly)?\b|\bper annum\b|\byear on year\b/.test(sentence);
    if (!yearly) continue;
    const figure = /(\d+(?:\.\d+)?)\s*(?:%|per\s?cent\b|percent\b)/.exec(sentence);
    if (figure) return Number(figure[1]) / 100;
    const word = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:per\s?cent|percent)\b/.exec(sentence);
    if (word) return WORD_PERCENT[word[1]] / 100;
  }
  return null;
}

/** YYYY-MM-DD, or null for an invalid Date, which is skipped rather than allowed to crash the page. */
const day = (value: string | Date): string | null => {
  if (typeof value === "string") return value.slice(0, 10);
  return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
};

export function checkEscalation(rates: Rate[], terms: Term[]): EscalationMismatch[] {
  const rules = terms
    .filter((term) => term.kind === "escalation")
    .map((term) => ({ term, rise: statedYearlyRise(`${term.summary}. ${term.quote ?? ""}`) }))
    .filter((rule): rule is { term: Term; rise: number } => rule.rise !== null);
  // Two rules saying different things is not something to pick between.
  if (!rules.length || new Set(rules.map((r) => r.rise)).size > 1) return [];
  const { term, rise } = rules[0];

  // One series per item, keeping the name as first printed.
  const byItem = new Map<string, { name: string; periods: { rate: number; from: string }[] }>();
  for (const r of rates) {
    const from = r.effective_from ? day(r.effective_from) : null;
    if (!from) continue;
    const key = r.printed_name.trim().toLowerCase();
    const series = byItem.get(key) ?? { name: r.printed_name, periods: [] };
    series.periods.push({ rate: r.rate, from });
    byItem.set(key, series);
  }

  const mismatches: EscalationMismatch[] = [];
  for (const { name, periods } of byItem.values()) {
    if (periods.length < 2) continue;
    // Two rates for one item on one date (two units, or a misread) cannot be
    // put in a series, so that item is left for the reviewer.
    if (new Set(periods.map((p) => p.from)).size < periods.length) continue;
    periods.sort((a, b) => a.from.localeCompare(b.from));
    const base = periods[0];
    for (const period of periods.slice(1)) {
      const years = Math.round((Date.parse(period.from) - Date.parse(base.from)) / (365.25 * 86_400_000));
      const expected = Math.round(base.rate * (1 + rise) ** years * 100) / 100;
      if (Math.abs(expected - period.rate) > 0.01) {
        mismatches.push({ printed_name: name, effective_from: period.from, read: period.rate, expected, quote: term.quote });
      }
    }
  }
  return mismatches;
}

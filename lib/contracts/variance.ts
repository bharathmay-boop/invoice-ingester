import "server-only";
import { printedUnit, toBaseUnit } from "../units.ts";

/**
 * What a contract says about one invoice line.
 *
 * Six answers, and three of them are right even when the rate itself was read
 * badly. `outside_period`, `not_in_contract` and `units_differ` depend on
 * dates, item identity and unit strings rather than on a model reading a
 * number off a table correctly, which makes them the sturdiest thing this
 * epic produces.
 */

export type Tag =
  | "matches_contract"
  | "billed_above_contract"
  | "billed_below_contract"
  | "outside_contract_period"
  | "not_in_contract"
  | "units_differ";

export type Finding = {
  tag: Tag;
  /** The contracted figure, where there was one to compare against. */
  contracted: number | null;
  billed: number;
  /** Signed, billed minus contracted, per unit. Null where nothing compared. */
  difference: number | null;
  /** What the difference costs over the quantity on the line. Null likewise. */
  impact: number | null;
  /** Why no comparison happened, in words a person can act on. */
  reason?: string;
};

export type Rate = {
  rate: number;
  unit: string | null;
  effective_from: string;
  effective_to: string | null;
};

export type Line = {
  unit_price: number;
  quantity: number;
  unit: string | null;
};

export const DEFAULT_TOLERANCE_PERCENT = 0.5;
export const TOLERANCE_SETTING = "variance_tolerance_percent";

/**
 * A tolerance has to stay a tolerance. Past a few percent the check stops
 * catching anything worth catching, and a setting that quietly disables a
 * safeguard should refuse rather than accept the number.
 */
export const MAX_TOLERANCE_PERCENT = 25;

export function checkTolerance(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0) {
    throw new Error("the tolerance must be zero percent or more");
  }
  if (percent > MAX_TOLERANCE_PERCENT) {
    throw new Error(
      `over ${MAX_TOLERANCE_PERCENT} percent the check stops catching anything worth catching`,
    );
  }
  return percent;
}

/**
 * The state of the contract side, worked out by the caller so this stays a
 * pure function of what was found.
 */
export type Coverage =
  // No contract with this vendor at all. Silence, not a finding: every invoice
  // from every uncontracted supplier would otherwise light up.
  | { kind: "no_contract" }
  // Contracts exist for this vendor, none of them cover this invoice date.
  // Billing after a contract lapsed is one of the most common forms of value
  // leakage and needs no correct rate to detect.
  | { kind: "outside_period" }
  // A contract covers the date and prices this item.
  | { kind: "covered"; rate: Rate }
  // A contract covers the date and never mentions this item.
  | { kind: "not_priced" };

/**
 * Compare one line against what was agreed.
 *
 * Returns null for silence. A line from a vendor with no contract, or one that
 * never matched a catalogue item, has nothing to say and saying nothing is the
 * answer.
 */
export function assess(
  coverage: Coverage,
  line: Line,
  tolerancePercent = DEFAULT_TOLERANCE_PERCENT,
): Finding | null {
  if (coverage.kind === "no_contract") return null;

  if (coverage.kind === "outside_period") {
    return {
      tag: "outside_contract_period",
      contracted: null,
      billed: line.unit_price,
      difference: null,
      impact: null,
      reason:
        "There is a contract with this supplier, but none of them covers this invoice date.",
    };
  }

  if (coverage.kind === "not_priced") {
    return {
      tag: "not_in_contract",
      contracted: null,
      billed: line.unit_price,
      difference: null,
      impact: null,
      reason: "A contract covers this date and does not put a rate against this item.",
    };
  }

  const { rate } = coverage;

  // Units first, for the same reason `comparePrices` checks them: a price per
  // ream against a price per sheet is out by a factor of five hundred, and
  // contracting per kilogram then billing per nine hundred gram pack is a
  // documented way to hide a rise. Saying nothing about it would be worse than
  // not having the check.
  const billedBase = toBaseUnit(line.unit, line.unit_price);
  const agreedBase = toBaseUnit(rate.unit, rate.rate);
  const samePrinted = printedUnit(line.unit) === printedUnit(rate.unit);

  let billed = line.unit_price;
  let contracted = rate.rate;

  if (!samePrinted) {
    if (!billedBase || !agreedBase) {
      return {
        tag: "units_differ",
        contracted: rate.rate,
        billed: line.unit_price,
        difference: null,
        impact: null,
        reason: `Agreed by the ${rate.unit ?? "unnamed unit"} and billed by the ${
          line.unit ?? "unnamed unit"
        }. A pack size depends on the product, so there is no way to convert between them here.`,
      };
    }
    if (billedBase.family !== agreedBase.family) {
      return {
        tag: "units_differ",
        contracted: rate.rate,
        billed: line.unit_price,
        difference: null,
        impact: null,
        reason: `Agreed by ${agreedBase.family} and billed by ${billedBase.family}, which measure different things.`,
      };
    }
    billed = billedBase.price;
    contracted = agreedBase.price;
  }

  const difference = billed - contracted;
  const within = contracted === 0 ? difference === 0 : Math.abs(difference / contracted) * 100 <= tolerancePercent;

  if (within) {
    return {
      tag: "matches_contract",
      contracted: rate.rate,
      billed: line.unit_price,
      difference: 0,
      impact: 0,
    };
  }

  // The money at stake on this line: the per unit gap times however many
  // units were billed, both in the same unit. Where the two sides were
  // converted, the quantity is converted with them, which `toBaseUnit` does
  // for free. Multiplying a converted price by an unconverted quantity is the
  // obvious way to be wrong by a factor of a thousand here.
  const quantity = samePrinted
    ? line.quantity
    : (toBaseUnit(line.unit, line.unit_price, line.quantity)?.quantity ?? line.quantity);
  const impact = difference * quantity;

  return {
    tag: difference > 0 ? "billed_above_contract" : "billed_below_contract",
    contracted: rate.rate,
    billed: line.unit_price,
    difference,
    impact,
  };
}

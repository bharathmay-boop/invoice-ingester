// Which vendor is cheapest is a sourcing recommendation, so it gets its own
// function and its own tests rather than living inline in a page.
import { perUnitLabel, printedUnit, toBaseUnit, type Family } from "./units.ts";

export type Priced = {
  vendor_id: string;
  vendor_name: string;
  unit_price: number;
  invoice_date: string;
  unit?: string | null;
};

/**
 * The lowest of each vendor's most recent price.
 *
 * Not the lowest price ever paid. That names a vendor who has since put their
 * price up, and sends you back to someone who is no longer the cheapest.
 *
 * Null when the prices are not comparable, rather than a recommendation made
 * by putting a price per gram against a price per ream. The check is here
 * rather than left to the caller: a wrong cheapest vendor is a sourcing
 * decision made on a number that means nothing, and every caller would have to
 * remember to ask first.
 *
 * `purchases` may be in any order; the latest per vendor is chosen by date.
 */
export function cheapestVendorNow<T extends Priced>(purchases: T[]): T | null {
  if (!comparePrices(purchases).comparable) return null;

  const latest = new Map<string, T>();

  for (const purchase of purchases) {
    const held = latest.get(purchase.vendor_id);
    if (!held || purchase.invoice_date > held.invoice_date) {
      latest.set(purchase.vendor_id, purchase);
    }
  }

  // Compared per base unit where the units convert, so a vendor selling by the
  // kilogram is not beaten by one selling the same thing by the gram.
  const priceOf = (p: T) => toBaseUnit(p.unit, p.unit_price)?.price ?? p.unit_price;

  let best: T | null = null;
  for (const purchase of latest.values()) {
    if (!best || priceOf(purchase) < priceOf(best)) best = purchase;
  }
  return best;
}

export type Comparison =
  | {
      comparable: true;
      /** Null when the unit is not one this converts, but every line uses it. */
      family: Family | null;
      /** How to describe the price: "per g", "each", or the printed unit. */
      label: string;
      /** Each purchase priced per base unit, in the order given. */
      priced: (Priced & { basePrice: number })[];
    }
  | { comparable: false; reason: string };



/**
 * Prices in different units cannot be compared, but many of them can be
 * converted first: kilograms and grams are the same measurement written two
 * ways, and a line with no unit at all is one of a thing.
 *
 * What cannot be converted is said plainly. A ream is 500 sheets of one
 * particular paper rather than 500 of anything, so the honest answer is that
 * these two prices are not comparable. Being told that is useful; a confident
 * wrong comparison, off by a factor of 500, is worse than being told nothing.
 */
export function comparePrices(purchases: Priced[]): Comparison {
  if (!purchases.length) return { comparable: false, reason: "Nothing bought yet." };

  const converted = purchases.map((p) => ({
    purchase: p,
    base: toBaseUnit(p.unit, p.unit_price),
  }));

  const unknown = converted.find((c) => c.base === null);
  if (unknown) {
    // A pack size cannot be converted, but every line priced in the same one
    // can still be compared with the others: two prices per ream answer each
    // other, they just cannot answer a price per sheet.
    const units = new Set(purchases.map((p) => printedUnit(p.unit)));
    if (units.size === 1) {
      const unit = unknown.purchase.unit?.trim() || "unit";
      return {
        comparable: true,
        family: null,
        label: `per ${unit}`,
        priced: purchases.map((p) => ({ ...p, basePrice: p.unit_price })),
      };
    }

    return {
      comparable: false,
      reason: `Bought by the ${unknown.purchase.unit ?? "unnamed unit"} and by other units. A pack size like a ream or a box depends on the product, so there is no way to convert between them here. The prices below are per invoice unit.`,
    };
  }

  const families = new Set(converted.map((c) => c.base!.family));
  if (families.size > 1) {
    return {
      comparable: false,
      reason: `Bought by ${[...families].join(" and ")}, which measure different things. The prices below are per invoice unit.`,
    };
  }

  const family = converted[0].base!.family;
  return {
    comparable: true,
    family,
    label: perUnitLabel(family),
    priced: converted.map((c) => ({ ...c.purchase, basePrice: c.base!.price })),
  };
}

/**
 * Kept as the question the screens actually ask. A single unit spelled two
 * ways, "Kg" and "kgs", is comparable, which the old string comparison called
 * a difference.
 */
export function unitsAreComparable(purchases: Priced[]): boolean {
  return comparePrices(purchases).comparable;
}

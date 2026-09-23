// Prices in different units are not comparable, and comparing them anyway is
// the worst thing this product could do quietly: one vendor billing 10 reams
// at Rs285 and another 5000 sheets at Rs0.57 are nearly the same price, and a
// naive trend line shows a cliff.
//
// So: convert what can be converted, and refuse to compare what cannot.

/** What a unit measures. Only units in the same family can be compared. */
export type Family = "mass" | "volume" | "length" | "count";

type Unit = { family: Family; /** How many base units one of these is. */ per: number };

/**
 * The units that appear on invoices, and what they are worth in the family's
 * base unit: grams, millilitres, centimetres, and one thing.
 *
 * Only genuine unit conversions are here. A ream is not 500 of anything by
 * definition, it is 500 sheets of a particular paper, and a box is whatever
 * the supplier decided to put in it. Those are pack sizes, they belong to a
 * product rather than to the language, and guessing one is how a spend figure
 * ends up wrong by a factor of 500.
 */
const UNITS: Record<string, Unit> = {
  // Mass, base gram.
  kg: { family: "mass", per: 1000 },
  kgs: { family: "mass", per: 1000 },
  kilogram: { family: "mass", per: 1000 },
  kilograms: { family: "mass", per: 1000 },
  g: { family: "mass", per: 1 },
  gm: { family: "mass", per: 1 },
  gms: { family: "mass", per: 1 },
  gram: { family: "mass", per: 1 },
  grams: { family: "mass", per: 1 },
  mg: { family: "mass", per: 0.001 },
  quintal: { family: "mass", per: 100_000 },
  tonne: { family: "mass", per: 1_000_000 },
  ton: { family: "mass", per: 1_000_000 },

  // Volume, base millilitre.
  l: { family: "volume", per: 1000 },
  ltr: { family: "volume", per: 1000 },
  ltrs: { family: "volume", per: 1000 },
  litre: { family: "volume", per: 1000 },
  litres: { family: "volume", per: 1000 },
  liter: { family: "volume", per: 1000 },
  liters: { family: "volume", per: 1000 },
  ml: { family: "volume", per: 1 },

  // Length, base centimetre.
  m: { family: "length", per: 100 },
  metre: { family: "length", per: 100 },
  metres: { family: "length", per: 100 },
  meter: { family: "length", per: 100 },
  meters: { family: "length", per: 100 },
  cm: { family: "length", per: 1 },
  mm: { family: "length", per: 0.1 },
  ft: { family: "length", per: 30.48 },
  feet: { family: "length", per: 30.48 },
  foot: { family: "length", per: 30.48 },
  inch: { family: "length", per: 2.54 },
  inches: { family: "length", per: 2.54 },

  // Count, base one thing.
  pc: { family: "count", per: 1 },
  pcs: { family: "count", per: 1 },
  piece: { family: "count", per: 1 },
  pieces: { family: "count", per: 1 },
  nos: { family: "count", per: 1 },
  no: { family: "count", per: 1 },
  unit: { family: "count", per: 1 },
  units: { family: "count", per: 1 },
  each: { family: "count", per: 1 },
  ea: { family: "count", per: 1 },
  dozen: { family: "count", per: 12 },
  doz: { family: "count", per: 12 },
  pair: { family: "count", per: 2 },
  pairs: { family: "count", per: 2 },
};

export const BASE_UNIT: Record<Family, string> = {
  mass: "g",
  volume: "ml",
  length: "cm",
  count: "each",
};

/**
 * A unit as written on an invoice, or null when nothing was printed, which is
 * treated as a count of one thing: a line for "3 staplers at Rs320" means the
 * same as "3 pc".
 */
export function parseUnit(unit: string | null | undefined): Unit | null {
  if (unit === null || unit === undefined || unit.trim() === "") {
    return UNITS.each;
  }
  const key = unit.trim().toLowerCase().replace(/\.$/, "").replace(/\s+/g, "");
  return UNITS[key] ?? null;
}

export type Converted = {
  family: Family;
  /** The price for one base unit: per gram, per millilitre, per centimetre, per thing. */
  price: number;
  /** How many base units the line covered, for a spend figure that adds up. */
  quantity: number;
};

/**
 * A line's price expressed per base unit, or null when the unit is not one
 * this understands. Null is a real answer here: it means "cannot be compared",
 * and the screens say so rather than drawing a line through it.
 */
export function toBaseUnit(
  unit: string | null | undefined,
  unitPrice: number,
  quantity = 1,
): Converted | null {
  const parsed = parseUnit(unit);
  if (!parsed || !Number.isFinite(unitPrice) || unitPrice < 0) return null;
  return {
    family: parsed.family,
    price: unitPrice / parsed.per,
    quantity: quantity * parsed.per,
  };
}

/** How to write a price per base unit, in the words someone would use. */
export function perUnitLabel(family: Family): string {
  return family === "count" ? "each" : `per ${BASE_UNIT[family]}`;
}

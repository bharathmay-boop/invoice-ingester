// Normalises a line item description into the key everything matches on.
// Every match score in the system depends on this, so it has its own tests.

// Removed when they follow a number: "500 sheets", "1 ream", "70 gsm".
const UNITS = [
  "gsm", "ml", "l", "ltr", "litre", "litres", "g", "gm", "gms", "kg", "kgs",
  "mg", "mm", "cm", "m", "inch", "inches", "pc", "pcs", "piece", "pieces",
  "sheet", "sheets", "ream", "reams", "pack", "packs", "packet", "packets",
  "box", "boxes", "nos", "unit", "units", "set", "sets", "dozen", "pair",
  "pairs", "roll", "rolls", "bottle", "bottles", "can", "cans", "bag", "bags",
  "tin", "tins", "jar", "jars", "tube", "tubes",
];

// Removed wherever they appear, on their own.
//
// ponytail: the container nouns here ("bottle", "box", "roll") are packaging on
// an invoice line far more often than they are the product, so they go. The
// ceiling is a product that genuinely is a container: "Water Bottle" normalises
// to "water" and can collide with bottled water. Revisit once there is a real
// catalogue to tune against, which is the only way to know if it ever bites.
const FILLER = [
  "of", "approx", "approximately", "qty", "quantity", "each", "assorted",
  "brand", "branded", "new", "genuine", "original", "premium", "quality",
  "with", "and", "for", "the", "size", "type", "grade",
  // measures
  "gsm", "ml", "ltr", "litre", "litres", "gm", "gms", "kg", "kgs", "mg", "mm",
  "cm", "inch", "inches",
  // containers and counts
  "pack", "packs", "packet", "packets", "set", "sets", "box", "boxes",
  "bottle", "bottles", "bag", "bags", "tin", "tins", "jar", "jars", "tube",
  "tubes", "can", "cans", "roll", "rolls", "sheet", "sheets", "ream", "reams",
  "pc", "pcs", "piece", "pieces", "nos", "unit", "units", "dozen", "pair",
  "pairs",
];

const QUANTITY_UNIT = new RegExp(
  String.raw`\b\d+(?:\.\d+)?\s*(?:${UNITS.join("|")})\b`,
  "g",
);
const PACK_OF = /\bpack(?:et)?s?\s+of\s+\d+(?:\.\d+)?\b/g;
const MULTIPLIER = /\b\d+(?:\.\d+)?\s*x\b/g;
const FILLER_TOKEN = new Set(FILLER);

export function normalize(description: string): string {
  const flattened = description
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/(\d)\.(?!\d)/g, "$1 ")
    .replace(/(^|\s)\.+|\.+(\s|$)/g, " ");

  const stripped = flattened
    .replace(PACK_OF, " ")
    .replace(QUANTITY_UNIT, " ")
    .replace(MULTIPLIER, " ");

  // Bare numbers survive on purpose: "hp 802 cartridge" and "hp 803 cartridge"
  // are different products, and only the number says so.
  const tokens = stripped
    .split(/\s+/)
    .filter((t) => t.length > 0 && !FILLER_TOKEN.has(t));

  // Sorted, so word order cannot change the key. pg_trgm is already close to
  // order insensitive; sorting makes that guaranteed rather than incidental,
  // and the readable form of an item lives in item.canonical_name anyway.
  return tokens.sort().join(" ");
}

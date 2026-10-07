/**
 * The currencies this product understands, in one place.
 *
 * Before this module the set was written out four times: a union here in
 * `lib/format.ts`, a zod enum in `lib/extract/schema.ts`, another in
 * `lib/contracts/schema.ts`, and a CHECK constraint in migration 014. Adding a
 * currency meant four coordinated edits and nothing failed if only three were
 * made. Both faults in #191 and #192 came out of that drift.
 *
 * No zod here on purpose. `lib/format.ts` imports this type and is used by
 * client components, so anything imported here ships to the browser. The zod
 * schema built from this list lives in `./schema.ts`.
 */

/** Ordered, because it is what a select and a prompt both read. */
export const CURRENCIES = ["INR", "USD", "EUR"] as const;

export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_NAMES: Record<Currency, string> = {
  INR: "Indian rupee",
  USD: "US dollar",
  EUR: "Euro",
};

/** For anything crossing a boundary: a database row, a query string, a model. */
export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

/**
 * "INR, USD or EUR", for the prompts. Written out rather than interpolated,
 * the model kept being told about three currencies after a fourth was added.
 */
// ponytail: assumes two or more. One currency would read "or INR", and a
// product with one currency would not need this module.
export const CURRENCY_LIST: string = `${CURRENCIES.slice(0, -1).join(", ")} or ${CURRENCIES.at(-1)}`;

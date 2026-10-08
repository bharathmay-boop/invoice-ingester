import { z } from "zod";

import { CURRENCIES } from "./currencies.ts";

/**
 * The one currency schema both readers use.
 *
 * Trims and uppercases before the enum, because a model that returns `inr` or
 * ` INR ` has read the document correctly and should not fail validation over
 * the shape of the letters.
 */
export const currencySchema = z.string().trim().toUpperCase().pipe(z.enum(CURRENCIES));

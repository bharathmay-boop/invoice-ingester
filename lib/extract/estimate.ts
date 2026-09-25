import "server-only";
import { getSetting } from "../settings/store.ts";
import { costOf, DEFAULT_OPENROUTER_MODEL } from "./models.ts";
import { DEFAULT_ANTHROPIC_MODEL, MODEL_SETTING, type Provider } from "./provider.ts";

/**
 * What a batch will cost, said before it is spent rather than after.
 *
 * Dropping thirty files spends real money from someone's own key. An estimate
 * beforehand is worth more than an exact figure afterwards, so this is
 * deliberately a range: a one page photo and a five page PDF holding three
 * invoices are not the same call, and a single number would be a precision
 * nobody should trust.
 */

/** What one file tends to take, from the calls recorded so far. */
const TOKENS = {
  low: { input: 1200, output: 250 },
  high: { input: 4000, output: 1200 },
};

export const BATCH_CONFIRM_SETTING = "batch_confirm_at";
export const DEFAULT_BATCH_CONFIRM_AT = 5;

export type Estimate = {
  model: string;
  /** US dollars for one file, or null when the model has no known price. */
  low: number | null;
  high: number | null;
  /** How many files can be dropped before the run asks first. */
  confirmAt: number;
};

export async function estimateBatch(provider: Provider): Promise<Estimate> {
  const model =
    provider === "anthropic"
      ? DEFAULT_ANTHROPIC_MODEL
      : ((await getSetting<string>(MODEL_SETTING)) ?? DEFAULT_OPENROUTER_MODEL);

  const [low, high] = await Promise.all([
    costOf(model, { input: TOKENS.low.input, output: TOKENS.low.output }),
    costOf(model, { input: TOKENS.high.input, output: TOKENS.high.output }),
  ]);

  const confirmAt = (await getSetting<number>(BATCH_CONFIRM_SETTING)) ?? DEFAULT_BATCH_CONFIRM_AT;

  return { model, low, high, confirmAt: Math.max(1, confirmAt) };
}

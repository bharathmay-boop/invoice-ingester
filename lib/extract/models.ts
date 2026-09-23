// The OpenRouter model list, built from the live catalogue rather than pinned
// in code.
//
// A hardcoded list of model IDs goes stale within weeks, and a retired ID does
// not fail when you pick it. It fails later, during an upload, which is the
// worst place to find out.
import "server-only";
import { getSetting, setSetting } from "../settings/store.ts";

const CATALOGUE_URL = "https://openrouter.ai/api/v1/models";
const CACHE_KEY = "openrouter_models_cache";
const CACHE_HOURS = 24;

/**
 * A rough invoice: one page as an image, plus a short structured answer. Used
 * only to put the models in a comparable order and to show roughly what each
 * costs, so the exact figures matter less than the ratio between them.
 */
const TOKENS_IN = 2000;
const TOKENS_OUT = 800;

/**
 * Curated, and only these two. Everything else about the list comes from the
 * catalogue. Matched by string, so a retired ID loses its badge rather than
 * breaking the page.
 */
export const RECOMMENDED: Record<string, string> = {
  "google/gemini-2.5-flash": "Cheap and reads scans well. A good default.",
  "anthropic/claude-haiku-4.5": "Steadier on structured output, for a few times the price.",
};

export const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.5-flash";

export type Model = {
  id: string;
  name: string;
  /** Rough US dollars for one invoice. */
  cost: number;
  /** US dollars per token, as the catalogue priced it when this was cached. */
  prices: { prompt: number; completion: number };
  recommended: string | null;
};

type Cached = { at: number; models: Model[] };

export type CatalogueEntry = {
  id: string;
  name?: string;
  architecture?: { input_modalities?: string[] };
  supported_parameters?: string[];
  pricing?: { prompt?: string; completion?: string };
};

export function usable(entry: CatalogueEntry): boolean {
  const modalities = entry.architecture?.input_modalities ?? [];
  const params = entry.supported_parameters ?? [];
  const prompt = Number(entry.pricing?.prompt ?? -1);
  const completion = Number(entry.pricing?.completion ?? -1);

  return (
    modalities.includes("image") &&
    // PDFs are sent as a file part, and most invoices arrive as PDFs. Without
    // this the list offered models that fail on every PDF, which is how
    // `openrouter/free` came to be selected and broke extraction outright.
    modalities.includes("file") &&
    params.includes("structured_outputs") &&
    // Batch variants are queued rather than answered. They are the cheapest
    // rows in the catalogue, so they would sort to the top of a list meant for
    // someone waiting on an upload.
    !entry.id.endsWith(":batch") &&
    // Routers price at -1 because the cost depends on where they route. Without
    // a number there is nothing to compare, so they are left out.
    prompt >= 0 &&
    completion >= 0
  );
}

function toModel(entry: CatalogueEntry): Model {
  const cost =
    Number(entry.pricing?.prompt ?? 0) * TOKENS_IN +
    Number(entry.pricing?.completion ?? 0) * TOKENS_OUT;

  return {
    id: entry.id,
    name: entry.name ?? entry.id,
    cost,
    prices: {
      prompt: Number(entry.pricing?.prompt ?? 0),
      completion: Number(entry.pricing?.completion ?? 0),
    },
    recommended: RECOMMENDED[entry.id] ?? null,
  };
}

export type Catalogue =
  | { ok: true; models: Model[]; stale: boolean }
  | { ok: false; reason: string };

/**
 * Cached in the database rather than in memory. Each serverless instance has
 * its own memory, so an in-memory cache would mean refetching the catalogue
 * from most of them and never really being cached at all.
 */
export async function listModels(): Promise<Catalogue> {
  const cached = await getSetting<Cached>(CACHE_KEY);
  const fresh = cached && Date.now() - cached.at < CACHE_HOURS * 3600_000;
  if (fresh && cached.models.length) {
    return { ok: true, models: cached.models, stale: false };
  }

  try {
    const response = await fetch(CATALOGUE_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`catalogue returned ${response.status}`);

    const body = (await response.json()) as { data?: CatalogueEntry[] };
    const models = (body.data ?? [])
      .filter(usable)
      .map(toModel)
      .sort((a, b) => {
        // Recommended first, then cheapest, so the list opens on the models
        // worth picking rather than on whatever the catalogue happened to list.
        if (Boolean(a.recommended) !== Boolean(b.recommended)) return a.recommended ? -1 : 1;
        return a.cost - b.cost;
      });

    if (!models.length) throw new Error("no model in the catalogue can do this job");

    await setSetting(CACHE_KEY, { at: Date.now(), models } satisfies Cached);
    return { ok: true, models, stale: false };
  } catch (error) {
    // Last known list beats an empty dropdown. Saying it is old beats pretending
    // it is current.
    if (cached?.models.length) return { ok: true, models: cached.models, stale: true };
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `Could not reach OpenRouter: ${error.message}`
          : "Could not reach OpenRouter.",
    };
  }
}

/** US dollars, at the precision the number deserves. */
export function formatCost(cost: number): string {
  if (cost === 0) return "free";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

/**
 * The Claude models this app can be pointed at, in US dollars per token. The
 * OpenRouter catalogue prices its own IDs, `anthropic/claude-opus-5` and the
 * like, and knows nothing about a call made straight to Anthropic, so those
 * prices are kept here. Anthropic publishes per million tokens.
 *
 * Checked against Anthropic's pricing on 2026-09-23. A model missing from here
 * is recorded as unpriced rather than free.
 */
const ANTHROPIC_PRICES: Record<string, { prompt: number; completion: number }> = {
  "claude-opus-5": { prompt: 5 / 1_000_000, completion: 25 / 1_000_000 },
};

/**
 * What one call cost, in US dollars, at the price in force when it was made.
 * Null when the model has no known price or the provider did not report usage:
 * an unknown cost is recorded as unknown, never as zero, which would quietly
 * understate a month.
 *
 * Reads the cached catalogue only. This runs just after an extraction, and a
 * spend figure is not worth making the user wait on a catalogue fetch.
 */
export async function costOf(
  modelId: string,
  usage: { input: number | null; output: number | null },
): Promise<number | null> {
  if (usage.input === null || usage.output === null) return null;

  const direct = ANTHROPIC_PRICES[modelId];
  if (direct) return usage.input * direct.prompt + usage.output * direct.completion;

  const cached = await getSetting<Cached>(CACHE_KEY);
  const prices = cached?.models.find((m) => m.id === modelId)?.prices;
  if (!prices) return null;
  return usage.input * prices.prompt + usage.output * prices.completion;
}

/**
 * The model to actually call. A model saved before it stopped qualifying, or
 * before this filter existed, falls back to the default rather than failing at
 * upload time, which is the worst place to find out.
 *
 * An empty cache means nothing is known, not that the model is bad, so the
 * configured one is used as it stands.
 */
export async function resolveModel(configured: string): Promise<string> {
  const cached = await getSetting<Cached>(CACHE_KEY);
  if (!cached?.models.length) return configured;
  return cached.models.some((m) => m.id === configured) ? configured : DEFAULT_OPENROUTER_MODEL;
}

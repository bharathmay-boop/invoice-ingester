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

type CatalogueEntry = {
  id: string;
  name?: string;
  architecture?: { input_modalities?: string[] };
  supported_parameters?: string[];
  pricing?: { prompt?: string; completion?: string };
};

function usable(entry: CatalogueEntry): boolean {
  const modalities = entry.architecture?.input_modalities ?? [];
  const params = entry.supported_parameters ?? [];
  const prompt = Number(entry.pricing?.prompt ?? -1);
  const completion = Number(entry.pricing?.completion ?? -1);

  return (
    modalities.includes("image") &&
    params.includes("structured_outputs") &&
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
 * What one call cost, in US dollars, from the price the catalogue carried when
 * it was last cached. Null when the model is not in the cache or the usage was
 * not reported: an unknown cost is recorded as unknown, never as zero, which
 * would quietly understate a month.
 *
 * Reads the cache only. This runs just after an extraction, and a spend figure
 * is not worth making the user wait on a catalogue fetch.
 */
export async function costOf(
  modelId: string,
  usage: { input: number | null; output: number | null },
): Promise<number | null> {
  if (usage.input === null || usage.output === null) return null;
  const cached = await getSetting<Cached>(CACHE_KEY);
  const prices = cached?.models.find((m) => m.id === modelId)?.prices;
  if (!prices) return null;
  return usage.input * prices.prompt + usage.output * prices.completion;
}

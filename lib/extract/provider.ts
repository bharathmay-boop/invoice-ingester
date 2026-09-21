// Which provider reads an invoice, and whether its key actually works.
import "server-only";
import { getSecret, getSetting, type SecretName } from "../settings/store.ts";

export const PROVIDERS = ["anthropic", "openrouter"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Claude API",
  openrouter: "OpenRouter",
};

export const SECRET_FOR: Record<Provider, SecretName> = {
  anthropic: "anthropic_api_key",
  openrouter: "openrouter_api_key",
};

export const PROVIDER_SETTING = "extraction_provider";
export const MODEL_SETTING = "openrouter_model";

/** Claude reads invoices well and needs no model choice, so it is the default. */
export const DEFAULT_PROVIDER: Provider = "anthropic";
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

export function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

export async function getProvider(): Promise<Provider> {
  const stored = await getSetting<string>(PROVIDER_SETTING);
  return isProvider(stored) ? stored : DEFAULT_PROVIDER;
}

export type ConnectionResult = { ok: true; detail: string } | { ok: false; error: string };

/**
 * One cheap call per provider. Reports pass or fail without ever echoing the
 * key, including in an error message, since provider errors sometimes quote
 * the credential back at you.
 */
export async function testConnection(provider: Provider): Promise<ConnectionResult> {
  const key = await getSecret(SECRET_FOR[provider]);
  if (!key) {
    return { ok: false, error: `No ${PROVIDER_LABEL[provider]} key is saved yet.` };
  }

  try {
    if (provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      });
      if (!response.ok) return { ok: false, error: await describe(response) };
      return { ok: true, detail: "The key works. Claude API reachable." };
    }

    const response = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!response.ok) return { ok: false, error: await describe(response) };

    const body = (await response.json()) as {
      data?: { label?: string; limit_remaining?: number | null };
    };
    const remaining = body.data?.limit_remaining;
    return {
      ok: true,
      detail:
        remaining === null || remaining === undefined
          ? "The key works. OpenRouter reachable."
          : `The key works. ${remaining.toFixed(2)} credit remaining.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `Could not reach the provider: ${error.message}` : "Could not reach the provider.",
    };
  }
}

/** Status codes only. A provider's error body can contain the key. */
async function describe(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) {
    return "The provider rejected that key.";
  }
  if (response.status === 429) return "Rate limited. The key is valid but busy.";
  return `The provider answered ${response.status}.`;
}

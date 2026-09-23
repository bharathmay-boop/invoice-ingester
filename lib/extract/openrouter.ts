import "server-only";
import { getSecret, getSetting } from "../settings/store.ts";
import { INSTRUCTIONS } from "./prompt.ts";
import { extractionJsonSchema, parseResponse } from "./schema.ts";
import { MODEL_SETTING } from "./provider.ts";
import { DEFAULT_OPENROUTER_MODEL, resolveModel } from "./models.ts";
import type { ExtractionOutcome } from "./anthropic.ts";

/**
 * OpenAI compatible endpoint with a json_schema response format. Returns the
 * same object as the Claude path and goes through the same zod parse, so
 * nothing downstream of validation knows which provider ran.
 */
export async function extractWithOpenRouter(
  source: { data: string; contentType: string; pages: number },
): Promise<ExtractionOutcome> {
  const key = await getSecret("openrouter_api_key");
  if (!key) return { ok: false, error: "No OpenRouter key is saved." };

  const model = await resolveModel((await getSetting<string>(MODEL_SETTING)) ?? DEFAULT_OPENROUTER_MODEL);
  const dataUrl = `data:${source.contentType};base64,${source.data}`;

  // PDFs go through the file part, images through image_url.
  const part =
    source.contentType === "application/pdf"
      ? { type: "file", file: { filename: "invoice.pdf", file_data: dataUrl } }
      : { type: "image_url", image_url: { url: dataUrl } };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: [part, { type: "text", text: INSTRUCTIONS }] }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "invoice", strict: true, schema: extractionJsonSchema },
        },
      }),
    });

    if (!response.ok) {
      // Status only. An error body from a provider can quote the key back.
      if (response.status === 401 || response.status === 403) {
        return { ok: false, error: "OpenRouter rejected that key." };
      }
      return { ok: false, error: `OpenRouter returned ${response.status}.` };
    }

    const body = (await response.json()) as {
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      choices?: { message?: { content?: string } }[];
    };

    const content = body.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "The model returned no invoice fields." };

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return { ok: false, error: "The model did not return JSON." };
    }

    const parsed = parseResponse(raw, source.pages);
    if (!parsed.ok) {
      return parsed.notInvoice
        ? { ok: false, notInvoice: true, error: parsed.reason }
        : { ok: false, error: parsed.error };
    }

    return {
      ok: true,
      invoices: parsed.invoices,
      meta: {
        provider: "openrouter",
        model: body.model ?? model,
        input_tokens: body.usage?.prompt_tokens ?? null,
        output_tokens: body.usage?.completion_tokens ?? null,
      },
    };
  } catch {
    return { ok: false, error: "Could not reach OpenRouter." };
  }
}

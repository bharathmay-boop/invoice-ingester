import "server-only";
import { getSecret, getSetting } from "../settings/store.ts";
import { INSTRUCTIONS } from "./prompt.ts";
import {
  CALL_TIMEOUT_MS,
  describeStatus,
  describeTimeout,
  describeUnreachable,
  describeUnusable,
  isRetryableStatus,
  isTimeout,
  withOneRetry,
} from "./failure.ts";
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
  if (!key) {
    return {
      ok: false,
      error: "No OpenRouter key is saved. Add one in settings, then upload again.",
    };
  }

  const model = await resolveModel((await getSetting<string>(MODEL_SETTING)) ?? DEFAULT_OPENROUTER_MODEL);
  const dataUrl = `data:${source.contentType};base64,${source.data}`;

  // PDFs go through the file part, images through image_url.
  const part =
    source.contentType === "application/pdf"
      ? { type: "file", file: { filename: "invoice.pdf", file_data: dataUrl } }
      : { type: "image_url", image_url: { url: dataUrl } };

  try {
    // Tried twice at most, and only when the first failure was the provider
    // being busy or briefly broken. A rejected key or a refusal gives the same
    // answer the second time, slower.
    const response = await withOneRetry(
      () =>
        fetch("https://openrouter.ai/api/v1/chat/completions", {
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
          // Without this a hung provider holds the request until the platform
          // kills it, and the person watching learns nothing for two minutes.
          signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        }).catch((error: unknown) => error),
      (result) =>
        result instanceof Response
          ? isRetryableStatus(result.status)
          : isTimeout(result) || result instanceof TypeError,
    );

    if (!(response instanceof Response)) {
      // Status and shape only. A provider's error body can quote the key back.
      const failure = isTimeout(response)
        ? describeTimeout("OpenRouter")
        : describeUnreachable("OpenRouter");
      return { ok: false, error: failure.message };
    }

    if (!response.ok) {
      return { ok: false, error: describeStatus("OpenRouter", response.status).message };
    }

    const body = (await response.json()) as {
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      choices?: { message?: { content?: string } }[];
    };

    const content = body.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: describeUnusable("nothing").message };

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return { ok: false, error: describeUnusable("not_json").message };
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
  } catch (error) {
    return {
      ok: false,
      error: (isTimeout(error) ? describeTimeout("OpenRouter") : describeUnreachable("OpenRouter"))
        .message,
    };
  }
}

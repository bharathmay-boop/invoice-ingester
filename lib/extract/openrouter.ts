import "server-only";
import { getSecret, getSetting } from "../settings/store.ts";
import { extractionJsonSchema, parseResponse } from "./schema.ts";
import { MODEL_SETTING } from "./provider.ts";
import { DEFAULT_OPENROUTER_MODEL } from "./models.ts";
import type { ExtractionOutcome } from "./anthropic.ts";

const INSTRUCTIONS = `You are reading a file someone uploaded as an Indian tax invoice.

First decide whether it is one. An invoice, bill or receipt names who issued
it, carries an invoice number or a date, and lists amounts charged. A product
photo, a quote without prices, a bank statement or any other document is not
an invoice. In reason, say in one short sentence what the file is. If it is not
an invoice, set is_invoice to false and invoice to null, and fill in nothing
else: an invented invoice number, date or amount is far worse than saying no.

If it is an invoice, set is_invoice to true and fill invoice as follows.

Return every figure exactly as printed. Do not compute, correct or round
anything: if the invoice's own totals disagree with its line items, return what
is printed and let the checks downstream catch it. Inventing a plausible number
is the worst thing you can do here.

- invoice_date must be YYYY-MM-DD.
- gstin is the supplier's 15 character GSTIN, or null if none is printed.
- For intra state invoices CGST and SGST are filled and IGST is 0. For inter
  state invoices IGST is filled and CGST and SGST are 0. Use 0, never null.
- amount is the line total as printed, not quantity times unit price.
- If a value genuinely is not on the invoice and the field allows null, use null.`;

/**
 * OpenAI compatible endpoint with a json_schema response format. Returns the
 * same object as the Claude path and goes through the same zod parse, so
 * nothing downstream of validation knows which provider ran.
 */
export async function extractWithOpenRouter(
  source: { data: string; contentType: string },
): Promise<ExtractionOutcome> {
  const key = await getSecret("openrouter_api_key");
  if (!key) return { ok: false, error: "No OpenRouter key is saved." };

  const model = (await getSetting<string>(MODEL_SETTING)) ?? DEFAULT_OPENROUTER_MODEL;
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

    const parsed = parseResponse(raw);
    if (!parsed.ok) {
      return parsed.notInvoice
        ? { ok: false, notInvoice: true, error: parsed.reason }
        : { ok: false, error: parsed.error };
    }

    return {
      ok: true,
      invoice: parsed.invoice,
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

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "../settings/store.ts";
import { INSTRUCTIONS } from "./prompt.ts";
import { extractionJsonSchema, parseResponse, type FoundInvoice } from "./schema.ts";
import { DEFAULT_ANTHROPIC_MODEL } from "./provider.ts";

const TOOL_NAME = "record_invoice";

export type ExtractionOutcome =
  | { ok: true; invoices: FoundInvoice[]; meta: Record<string, unknown> }
  // `notInvoice` marks a file the model read and declined, with `error` saying
  // what it was, as opposed to a call that failed.
  | { ok: false; error: string; notInvoice?: boolean };

/**
 * A tool with `strict: true`, so the arguments are guaranteed to match the
 * schema. The zod parse still runs: strict guarantees shape, not that the date
 * is real or the GSTIN well formed.
 */
export async function extractWithAnthropic(
  source: { data: string; contentType: string; pages: number },
): Promise<ExtractionOutcome> {
  const key = await getSecret("anthropic_api_key");
  if (!key) return { ok: false, error: "No Claude API key is saved." };

  const client = new Anthropic({ apiKey: key });

  // Sent as base64 rather than a URL. The originals are stored privately, so
  // there is no URL the provider could fetch, and an invoice is not something
  // to put on a public link just to save an upload.
  const content =
    source.contentType === "application/pdf"
      ? ([
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: source.data },
          },
        ] as const)
      : ([
          {
            type: "image",
            source: {
              type: "base64",
              media_type: source.contentType as "image/jpeg" | "image/png" | "image/webp",
              data: source.data,
            },
          },
        ] as const);

  try {
    const message = await client.messages.create({
      model: DEFAULT_ANTHROPIC_MODEL,
      // Up to 15 invoices in one reply. Kept under the SDK's ceiling for a
      // request that is not streamed.
      max_tokens: 16000,
      tools: [
        {
          name: TOOL_NAME,
          description: "Say whether the file holds invoices and record every one exactly as printed.",
          input_schema: extractionJsonSchema as Anthropic.Tool["input_schema"],
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            ...content,
            { type: "text", text: INSTRUCTIONS },
          ] as Anthropic.MessageParam["content"],
        },
      ],
    });

    const call = message.content.find((block) => block.type === "tool_use");
    if (!call || call.type !== "tool_use") {
      return { ok: false, error: "The model did not return invoice fields." };
    }

    const parsed = parseResponse(call.input, source.pages);
    if (!parsed.ok) {
      return parsed.notInvoice
        ? { ok: false, notInvoice: true, error: parsed.reason }
        : { ok: false, error: parsed.error };
    }

    return {
      ok: true,
      invoices: parsed.invoices,
      // Recorded so it is possible to tell later whether one model reads a
      // given vendor's layout better than another.
      meta: {
        provider: "anthropic",
        model: message.model,
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      },
    };
  } catch (error) {
    // Provider errors can quote the credential back, so only the message shape
    // is surfaced, never the raw body.
    if (error instanceof Anthropic.APIError) {
      return { ok: false, error: `Claude API returned ${error.status}.` };
    }
    return { ok: false, error: "Could not reach the Claude API." };
  }
}

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "../settings/store.ts";
import { extractionJsonSchema, parseResponse, type ExtractedInvoice } from "./schema.ts";
import { DEFAULT_ANTHROPIC_MODEL } from "./provider.ts";

const TOOL_NAME = "record_invoice";

const INSTRUCTIONS = `You are reading a file someone uploaded as an Indian tax invoice.

First decide whether it is one. An invoice, bill or receipt shows all four
of: who issued it, an invoice number, a date, and the amounts charged. A
product photo, a quote without prices, a bank statement or any other document
is not an invoice. Nor is a bill that is missing any of the four: every field
below is required, and a missing number or date must never be filled with a
guess or a placeholder.

In reason, say in one short sentence what the file is, and for a bill that
falls short, which of the four is missing. If it is not an invoice, set
is_invoice to false and invoice to null: an invented invoice number, date or
amount is far worse than saying no.

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

export type ExtractionOutcome =
  | { ok: true; invoice: ExtractedInvoice; meta: Record<string, unknown> }
  // `notInvoice` marks a file the model read and declined, with `error` saying
  // what it was, as opposed to a call that failed.
  | { ok: false; error: string; notInvoice?: boolean };

/**
 * A tool with `strict: true`, so the arguments are guaranteed to match the
 * schema. The zod parse still runs: strict guarantees shape, not that the date
 * is real or the GSTIN well formed.
 */
export async function extractWithAnthropic(
  source: { data: string; contentType: string },
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
      max_tokens: 4096,
      tools: [
        {
          name: TOOL_NAME,
          description: "Say whether the file is an invoice and, if it is, record its particulars exactly as printed.",
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

    const parsed = parseResponse(call.input);
    if (!parsed.ok) {
      return parsed.notInvoice
        ? { ok: false, notInvoice: true, error: parsed.reason }
        : { ok: false, error: parsed.error };
    }

    return {
      ok: true,
      invoice: parsed.invoice,
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

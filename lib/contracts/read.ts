import "server-only";
import { getSecret, getSetting } from "../settings/store.ts";
import {
  CALL_TIMEOUT_MS,
  describeStatus,
  describeTimeout,
  describeUnreachable,
  describeUnusable,
  isTimeout,
} from "../extract/failure.ts";
import { MODEL_SETTING } from "../extract/provider.ts";
import { DEFAULT_OPENROUTER_MODEL, resolveModel } from "../extract/models.ts";
import { CONTRACT_INSTRUCTIONS } from "./prompt.ts";
import { contractJsonSchema, parseContractResponse, type ContractParseResult } from "./schema.ts";

const PROVIDER = "OpenRouter";

export type ContractRead = ContractParseResult & { meta?: unknown };

/**
 * Read one contract.
 *
 * The whole PDF goes in one call rather than being split. Two hundred pages
 * fits inside the context window with room to spare, and the clauses refer to
 * each other: a rate table on page forty four that says "subject to the
 * escalation in clause 9.3" only resolves if clause 9.3 is in the same call.
 * Splitting it also has a failure nobody can see, where a pass that locates
 * the commercial pages misses one and the pass that extracts never knows.
 *
 * No retry here. The queue owns retries, because a worker that dies does not
 * get to decide anything, and a second try inside the same invocation spends
 * the same sixty seconds twice.
 */
export async function readContract(source: {
  data: string;
  contentType: string;
}): Promise<ContractRead> {
  const key = await getSecret("openrouter_api_key");
  if (!key) {
    return {
      ok: false,
      failure: { message: "No OpenRouter key is saved. Add one in settings.", retryable: false },
    };
  }

  const model = await resolveModel(
    (await getSetting<string>(MODEL_SETTING)) ?? DEFAULT_OPENROUTER_MODEL,
  );

  const dataUrl = `data:${source.contentType};base64,${source.data}`;
  const part =
    source.contentType === "application/pdf"
      ? { type: "file", file: { filename: "contract.pdf", file_data: dataUrl } }
      : { type: "image_url", image_url: { url: dataUrl } };

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "user", content: [part, { type: "text", text: CONTRACT_INSTRUCTIONS }] },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "contract", strict: true, schema: contractJsonSchema },
        },
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeout(error)) return { ok: false, failure: describeTimeout(PROVIDER) };
    return { ok: false, failure: describeUnreachable(PROVIDER) };
  }

  if (!response.ok) return { ok: false, failure: describeStatus(PROVIDER, response.status) };

  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: Record<string, unknown>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return { ok: false, failure: describeUnusable("nothing") };

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return { ok: false, failure: describeUnusable("not_json") };
  }

  const parsed = parseContractResponse(raw);
  return parsed.ok ? { ...parsed, meta: { model, usage: body.usage } } : parsed;
}

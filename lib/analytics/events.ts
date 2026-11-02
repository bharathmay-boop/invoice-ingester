/**
 * Every analytics event, and the only properties each may carry (#200).
 *
 * Names are object_verb_past_tense in lower snake case, settled once, because
 * renaming an event later splits its history in two. Properties are codes,
 * counts, booleans, durations, model names and enum values: never a name, a
 * figure from a document, a search term, free text or a row id. `capture` in
 * app/analytics-provider.tsx and `track` in lib/analytics/server.ts both take
 * this map, so an unlisted event or property does not compile.
 *
 * upload_extracted and extraction_completed are kept apart on purpose: the
 * first is what the person saw, from the browser; the second is what the
 * call cost, from the server.
 */
export type Events = {
  $pageview: { $current_url: string };
  signed_in: Empty;
  signed_out: Empty;
  demo_started: Empty;
  upload_started: { content_type: string; size_bytes: number };
  upload_rejected: { not_an_invoice: boolean };
  upload_extracted: { invoices: number; over_limit: boolean };
  extraction_completed: {
    provider: string;
    model: string;
    input_tokens: number | null;
    output_tokens: number | null;
    cost_usd: number | null;
    pages: number | null;
    invoices: number | null;
    duration_ms: number;
    outcome: "extracted" | "not_an_invoice" | "failed";
  };
  invoice_saved: { line_items: number; flagged: boolean; had_tax_id: boolean };
  draft_discarded: Empty;
  items_merged: { moved: number };
  alias_added: Empty;
  suggestion_decided: { verdict: "accepted" | "rejected" };
  contract_reviewed: Empty;
};

type Empty = Record<string, never>;

export type EventName = keyof Events;

/**
 * The arguments for an event: none when it carries nothing, otherwise exactly
 * its listed properties. Shared by both sides so they cannot drift.
 */
export type EventArgs<E extends EventName> = Events[E] extends Empty ? [] : [properties: Events[E]];

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
import type { FindingCounts, ImpactBand } from "./value.ts";

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
  // The contract pipeline (#201). Counts and codes only: never a quote, a
  // rate, a title or an exception message.
  contract_upload_started: { content_type: string; size_bytes: number };
  /** A new file entered the queue. Pages are not known until it is opened. */
  contract_queued: { duplicate: boolean };
  contract_read: {
    pages: number | null;
    rates: number;
    located: number;
    unlocated: number;
    duration_ms: number;
    model: string | null;
  };
  contract_read_failed: {
    failure: "refused" | "not_a_contract" | "read_failed" | "crashed";
    pages: number | null;
    attempt: number;
  };
  /** The sweeper handed back contracts a dead worker was holding. */
  contract_reclaimed: { contracts: number };
  contract_review_opened: { rates: number };
  rate_confirmed: { item: "existing" | "new"; has_page: boolean };
  // Where the product pays off (#202). A search sends its result count,
  // never the term; an amount goes as a band.
  item_viewed: { purchases: number; vendors: number };
  vendor_viewed: { invoices: number };
  search_performed: { results: number };
  findings_viewed: FindingCounts;
  finding_opened: { tag: string; impact: ImpactBand };
  original_opened: Empty;
  price_chart_rendered: { points: number };
};

type Empty = Record<string, never>;

export type EventName = keyof Events;

/**
 * The arguments for an event: none when it carries nothing, otherwise exactly
 * its listed properties. Shared by both sides so they cannot drift.
 */
export type EventArgs<E extends EventName> = Events[E] extends Empty ? [] : [properties: Events[E]];

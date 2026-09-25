import "server-only";
import { query } from "./db.ts";
import { track } from "./analytics/server.ts";
import { costOf } from "./extract/models.ts";

export type Outcome = "extracted" | "not_an_invoice" | "failed";

export type ExtractionCall = {
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  pages: number | null;
  invoices: number | null;
  durationMs: number;
  outcome: Outcome;
  /** Only for a failure, and only the app's own message, never a provider body. */
  reason?: string;
};

/**
 * Records one provider call in both places: the table, which is the record of
 * what was spent, and PostHog, which is where it is read from a phone.
 *
 * Nothing here identifies a supplier or an amount charged. Counts, a model
 * name and a cost only.
 *
 * Never throws. A call that has already been paid for should not also fail the
 * user's upload because its bookkeeping did.
 */
export async function recordExtraction(call: ExtractionCall): Promise<{ cost: number | null }> {
  const cost = await costOf(call.model, { input: call.inputTokens, output: call.outputTokens }).catch(
    () => null,
  );

  try {
    await query(
      `INSERT INTO extraction_event (provider, model, input_tokens, output_tokens, cost,
                                     pages, invoices, duration_ms, outcome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        call.provider,
        call.model,
        call.inputTokens,
        call.outputTokens,
        cost,
        call.pages,
        call.invoices,
        call.durationMs,
        call.outcome,
      ],
    );
  } catch (error) {
    console.error("could not record extraction", error instanceof Error ? error.message : error);
  }

  await track("extraction_completed", {
    provider: call.provider,
    model: call.model,
    input_tokens: call.inputTokens,
    output_tokens: call.outputTokens,
    cost_usd: cost,
    pages: call.pages,
    invoices: call.invoices,
    duration_ms: call.durationMs,
    outcome: call.outcome,
    reason: call.reason,
  });

  // Handed back so the upload screen can report what a batch actually cost,
  // beside the estimate it gave beforehand.
  return { cost };
}

export type Usage = {
  calls: number;
  invoices: number;
  cost: number;
  /** Calls whose cost could not be priced, so the total is a floor, not a figure. */
  unpriced: number;
  failures: number;
};

/** Usage since a point in time, for the panel in settings. */
export async function usageSince(since: Date): Promise<Usage> {
  const [row] = await query<{
    calls: string;
    invoices: string | null;
    cost: string | null;
    unpriced: string;
    failures: string;
  }>(
    `SELECT count(*) AS calls,
            coalesce(sum(invoices), 0) AS invoices,
            coalesce(sum(cost), 0) AS cost,
            count(*) FILTER (WHERE cost IS NULL) AS unpriced,
            count(*) FILTER (WHERE outcome = 'failed') AS failures
     FROM extraction_event WHERE created_at >= $1`,
    [since],
  );

  return {
    calls: Number(row?.calls ?? 0),
    invoices: Number(row?.invoices ?? 0),
    cost: Number(row?.cost ?? 0),
    unpriced: Number(row?.unpriced ?? 0),
    failures: Number(row?.failures ?? 0),
  };
}

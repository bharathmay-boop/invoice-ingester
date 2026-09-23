import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server.js";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { pool, query } from "@/lib/db.ts";
import { discardUpload } from "@/lib/blob.ts";
import { extractWithAnthropic } from "@/lib/extract/anthropic.ts";
import { extractWithOpenRouter } from "@/lib/extract/openrouter.ts";
import { DEFAULT_ANTHROPIC_MODEL, getProvider, MODEL_SETTING } from "@/lib/extract/provider.ts";
import { DEFAULT_OPENROUTER_MODEL } from "@/lib/extract/models.ts";
import {
  DEFAULT_TOLERANCE_RUPEES,
  describeDiscrepancy,
  findRepeats,
  validateArithmetic,
  warning,
} from "@/lib/extract/validate.ts";
import type { ExtractedInvoice } from "@/lib/extract/schema.ts";
import { MAX_INVOICES_PER_FILE } from "@/lib/upload.ts";
import { normalize } from "@/lib/items/normalize.ts";
import { countPages } from "@/lib/pdf.ts";
import { recordExtraction } from "@/lib/usage.ts";
import { trackError } from "@/lib/analytics/server.ts";
import { getSetting } from "@/lib/settings/store.ts";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Whether this supplier's invoice number is already stored. Matched on GSTIN
 * where there is one, and on the normalised name otherwise, the same way the
 * save path finds the vendor. The name match includes the rows migration 010
 * renamed apart, whose invoices are this supplier's too and would otherwise be
 * invisible here and savable a second time. Saving it again would fail on the unique
 * constraint anyway; this says so before anyone spends time reviewing it.
 */
async function alreadySaved(invoice: ExtractedInvoice): Promise<boolean> {
  const rows = await query(
    `SELECT 1 FROM invoice i JOIN vendor v ON v.id = i.vendor_id
     WHERE i.invoice_number = $1
       AND CASE WHEN $2::text IS NOT NULL THEN v.gstin = $2
                ELSE v.gstin IS NULL
                     AND (v.normalized_name = $3 OR v.normalized_name LIKE $3 || ' (separate %')
                END
     LIMIT 1`,
    [invoice.invoice_number, invoice.gstin, normalize(invoice.vendor_name)],
  );
  return rows.length > 0;
}

export async function POST(request: NextRequest) {
  const jar = await cookies();
  if (!(await isValidSession(jar.get(sessionCookie.name)?.value))) {
    return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  }

  const { url, name, contentType } = await request.json().catch(() => ({}));
  if (typeof url !== "string" || typeof name !== "string" || typeof contentType !== "string") {
    return NextResponse.json({ error: "Expected a stored file." }, { status: 400 });
  }

  // Only a blob this app stored, and only once. The delete is the claim: two
  // requests for the same file cannot both win it, so they cannot both call the
  // provider and end up with two drafts pointing at one blob, where discarding
  // either would pull the original out from under the other.
  const claimed = await query<{ id: string }>(
    "DELETE FROM upload WHERE blob_url = $1 RETURNING id",
    [url],
  );
  if (!claimed.length) {
    return NextResponse.json(
      { error: "That file was not uploaded here, or has already been read." },
      { status: 404 },
    );
  }

  // From here the upload row is gone, so nothing but this block knows the file
  // exists. Every path out of it either hands the blob to a draft or deletes
  // it: leaving on any other path strands a private invoice in the store that
  // no row can ever find again.
  try {
    const provider = await getProvider();

    // Read the private blob here rather than handing the provider a URL. A
    // private blob has no URL anyone can fetch, which is the point of it.
    const stored = await get(url, { access: "private" });
    if (!stored) {
      await discardUpload(url);
      return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 502 });
    }
    const bytes = Buffer.from(await new Response(stored.stream).arrayBuffer());
    const data = bytes.toString("base64");
    // The upload route refused any PDF it could not count, so null here means
    // the stored file is not what was checked.
    const pages = contentType === "application/pdf" ? await countPages(bytes) : 1;
    if (pages === null) {
      await discardUpload(url);
      return NextResponse.json({ error: "Could not open the stored PDF." }, { status: 422 });
    }

    // Kept for the record below, so a failed call is still attributable to the
    // model that failed, where the provider told us nothing.
    const configuredModel =
      provider === "anthropic"
        ? DEFAULT_ANTHROPIC_MODEL
        : ((await getSetting<string>(MODEL_SETTING)) ?? DEFAULT_OPENROUTER_MODEL);

    const startedAt = Date.now();
    const outcome =
      provider === "anthropic"
        ? await extractWithAnthropic({ data, contentType, pages })
        : await extractWithOpenRouter({ data, contentType, pages });

    // Recorded for every call, including the ones that came to nothing. A
    // failure is paid for too, and a month of them is worth seeing.
    const meta = outcome.ok ? outcome.meta : {};
    await recordExtraction({
      provider,
      model: String(meta.model ?? configuredModel),
      inputTokens: (meta.input_tokens as number | null) ?? null,
      outputTokens: (meta.output_tokens as number | null) ?? null,
      pages,
      invoices: outcome.ok ? outcome.invoices.length : 0,
      durationMs: Date.now() - startedAt,
      outcome: outcome.ok ? "extracted" : outcome.notInvoice ? "not_an_invoice" : "failed",
      reason: outcome.ok ? undefined : outcome.error,
    });

    if (!outcome.ok) {
      // A file that is not an invoice leaves nothing behind either: no draft
      // to confirm by accident, no original kept for a file nobody wanted read.
      await discardUpload(url);
      return NextResponse.json(
        { error: outcome.error, notInvoice: outcome.notInvoice === true },
        { status: 422 },
      );
    }

    const tolerance =
      (await getSetting<number>("rounding_tolerance")) ?? DEFAULT_TOLERANCE_RUPEES;
    const repeats = findRepeats(outcome.invoices.map((f) => f.invoice));

    const drafts = [];
    for (const [i, found] of outcome.invoices.entries()) {
      const checks = validateArithmetic(found.invoice, tolerance);
      if (repeats.has(i)) checks.discrepancies.push(warning("repeated_in_file"));
      if (await alreadySaved(found.invoice)) checks.discrepancies.push(warning("already_saved"));
      drafts.push({ found, discrepancies: checks.discrepancies });
    }

    // All or none. Half the invoices of a file saved as drafts, with the
    // original then deleted by the catch below, would leave drafts pointing at
    // nothing.
    const client = await pool.connect();
    const ids: string[] = [];
    try {
      await client.query("BEGIN");
      for (const { found, discrepancies } of drafts) {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO draft (blob_url, file_name, content_type, extracted, discrepancies,
                              status, extraction_meta, first_page, last_page)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            url,
            name,
            contentType,
            JSON.stringify(found.invoice),
            JSON.stringify(discrepancies),
            discrepancies.length ? "needs_review" : "checks_passed",
            JSON.stringify(outcome.meta),
            found.first_page,
            found.last_page,
          ],
        );
        ids.push(rows[0].id);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    // Ownership has transferred. The drafts share the blob from here, and it
    // goes when the last of them is discarded.
    return NextResponse.json({
      drafts: drafts.map(({ found, discrepancies }, i) => ({
        id: ids[i],
        firstPage: found.first_page,
        lastPage: found.last_page,
        summary: discrepancies.length
          ? `${found.invoice.invoice_number}: ${discrepancies.map(describeDiscrepancy).join(" ")}`
          : `${found.invoice.vendor_name}, ${found.invoice.invoice_number}, ${found.invoice.line_items.length} line items. The figures add up.`,
      })),
      overLimit: drafts.length > MAX_INVOICES_PER_FILE,
    });
  } catch (error) {
    // A throw anywhere above, including from the draft insert itself, leaves
    // nothing owning the file.
    await discardUpload(url);
    console.error("extraction failed after claiming the upload", error);
    await trackError(error, { route: "extract", content_type: contentType });
    return NextResponse.json({ error: "Could not read that invoice." }, { status: 500 });
  }
}

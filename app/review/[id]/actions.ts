"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { pool, query } from "@/lib/db.ts";
import { parseExtraction } from "@/lib/extract/schema.ts";
import { validateArithmetic, DEFAULT_TOLERANCE_RUPEES } from "@/lib/extract/validate.ts";
import { getSetting } from "@/lib/settings/store.ts";
import { normalize } from "@/lib/items/normalize.ts";
import { getThresholds } from "@/lib/items/match.ts";
import { saveLine } from "@/lib/items/save-line.ts";
import { releaseDraft } from "@/lib/blob.ts";
import { track } from "@/lib/analytics/server.ts";

export type SaveResult = { ok: false; message: string; duplicateId?: string } | null;

async function requireSession() {
  const jar = await cookies();
  if (!(await isValidSession(jar.get(sessionCookie.name)?.value))) {
    throw new Error("Sign in to save invoices.");
  }
}

/**
 * Saves the reviewed invoice. Everything happens in one transaction: an
 * invoice that is half written is worse than one that failed.
 */
export async function confirmDraft(_previous: SaveResult, form: FormData): Promise<SaveResult> {
  await requireSession();

  const draftId = form.get("draftId");
  const payload = form.get("invoice");
  if (typeof draftId !== "string" || typeof payload !== "string") {
    return { ok: false, message: "Nothing to save." };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    // The invoice rides in a hidden field, so a tampered or truncated value is
    // a message back to the form, not an uncaught SyntaxError.
    return { ok: false, message: "Could not read the edited invoice. Reload and try again." };
  }

  const parsed = parseExtraction(raw);
  if (!parsed.ok) {
    return { ok: false, message: parsed.error };
  }
  const invoice = parsed.data;

  const tolerance = (await getSetting<number>("rounding_tolerance")) ?? DEFAULT_TOLERANCE_RUPEES;
  // Re-checked on the edited figures, not the extracted ones: correcting one
  // number by hand can easily break the sum.
  const checks = validateArithmetic(invoice, tolerance);

  // Read before taking a connection. Reading it inside the transaction means a
  // client holding one connection while asking the same pool for another, and
  // enough concurrent saves would each hold one and wait forever for the next.
  //
  // Guarded, because a saved pair that contradicts itself is refused on read,
  // and that should come back as a message about settings rather than as an
  // unhandled error on a save someone was in the middle of.
  let thresholds;
  try {
    thresholds = await getThresholds();
  } catch (error) {
    return {
      ok: false,
      message: `The matching thresholds in settings cannot be used: ${
        error instanceof Error ? error.message : "they do not make a valid pair"
      }.`,
    };
  }

  const client = await pool.connect();
  let savedId: string;
  let blobUrl: string;
  try {
    await client.query("BEGIN");

    // Claimed inside the transaction, not read before it. Two confirms of the
    // same draft would otherwise both proceed, and for an invoice with no
    // GSTIN each would create its own vendor, so the
    // UNIQUE (vendor_id, invoice_number) constraint would not see a duplicate
    // and the same invoice would be stored twice.
    const claimed = await client.query<{
      blob_url: string;
      extraction_meta: unknown;
      content_type: string;
      first_page: number | null;
    }>(
      "SELECT blob_url, extraction_meta, content_type, first_page FROM draft WHERE id = $1 FOR UPDATE",
      [draftId],
    );
    if (!claimed.rows.length) {
      await client.query("ROLLBACK");
      return { ok: false, message: "That draft has already been saved or discarded." };
    }
    const draft = claimed.rows[0];
    blobUrl = draft.blob_url;

    // GSTIN is a real unique business identifier, so vendor identity is an
    // exact key lookup rather than a guess.
    const vendor = invoice.gstin
      ? await client.query<{ id: string }>(
          `INSERT INTO vendor (gstin, name, normalized_name)
           VALUES ($1, $2, $3)
           ON CONFLICT (gstin) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [invoice.gstin, invoice.vendor_name, normalize(invoice.vendor_name)],
        )
      : await client.query<{ id: string }>(
          // Reused by name, so the invoice constraint below can see the same
          // supplier twice. The no-op update is there so RETURNING hands back
          // the existing row's id.
          `INSERT INTO vendor (name, normalized_name) VALUES ($1, $2)
           ON CONFLICT (normalized_name) WHERE gstin IS NULL
           DO UPDATE SET name = vendor.name
           RETURNING id`,
          [invoice.vendor_name, normalize(invoice.vendor_name)],
        );

    const vendorId = vendor.rows[0].id;

    const saved = await client.query<{ id: string }>(
      `INSERT INTO invoice (vendor_id, invoice_number, invoice_date, subtotal, cgst,
                            sgst, igst, total, blob_url, status, extraction_meta,
                            content_type, first_page)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        vendorId,
        invoice.invoice_number,
        invoice.invoice_date,
        invoice.subtotal,
        invoice.cgst,
        invoice.sgst,
        invoice.igst,
        invoice.total,
        draft.blob_url,
        checks.status,
        JSON.stringify(draft.extraction_meta ?? {}),
        // Carried over so the original can be shown from the vendor and item
        // screens: how to render it, and which page this invoice starts on.
        draft.content_type,
        draft.first_page,
      ],
    );
    savedId = saved.rows[0].id;

    for (const line of invoice.line_items) {
      await saveLine(client, savedId, line, thresholds);
    }

    await client.query("DELETE FROM draft WHERE id = $1", [draftId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");

    // The unique constraint is the duplicate check. Catch it specifically and
    // offer the invoice already stored rather than showing a database error.
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      const [existing] = await query<{ id: string }>(
        `SELECT i.id FROM invoice i JOIN vendor v ON v.id = i.vendor_id
         WHERE i.invoice_number = $2
           AND CASE WHEN $1::text IS NOT NULL THEN v.gstin = $1
                    ELSE v.gstin IS NULL
                         AND (v.normalized_name = $3 OR v.normalized_name LIKE $3 || ' (separate %')
                    END`,
        [invoice.gstin, invoice.invoice_number, normalize(invoice.vendor_name)],
      );
      return {
        ok: false,
        message: `Invoice ${invoice.invoice_number} from this vendor is already stored.`,
        duplicateId: existing?.id,
      };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save the invoice.",
    };
  } finally {
    client.release();
  }

  // Sent here rather than from the click, so the event means an invoice was
  // saved rather than that someone tried.
  await track("invoice_saved", {
    line_items: invoice.line_items.length,
    flagged: checks.status !== "confirmed",
    had_gstin: invoice.gstin !== null,
  });

  revalidatePath("/");
  revalidatePath("/items");
  revalidatePath("/vendors");
  redirect(await nextFromSameFile(blobUrl, `/vendors?saved=${savedId}`));
}

export async function discardDraft(_previous: SaveResult, form: FormData): Promise<SaveResult> {
  await requireSession();
  const draftId = form.get("draftId");
  if (typeof draftId !== "string") return { ok: false, message: "Nothing to discard." };

  // Read before the discard so the next invoice from the same file can be
  // found after it. releaseDraft is the claim and decides about the original.
  const [draft] = await query<{ blob_url: string }>(
    "SELECT blob_url FROM draft WHERE id = $1",
    [draftId],
  );
  const released = await releaseDraft(draftId);
  if (released) await track("draft_discarded", {});

  redirect(draft ? await nextFromSameFile(draft.blob_url, "/upload") : "/upload");
}

/**
 * Where to go after finishing with one invoice: the next draft from the same
 * file, so a three invoice PDF is reviewed in one pass rather than by going
 * back to the upload page between each.
 */
async function nextFromSameFile(blobUrl: string, otherwise: string): Promise<string> {
  const [next] = await query<{ id: string }>(
    `SELECT id FROM draft WHERE blob_url = $1
     ORDER BY first_page NULLS FIRST, created_at LIMIT 1`,
    [blobUrl],
  );
  return next ? `/review/${next.id}` : otherwise;
}

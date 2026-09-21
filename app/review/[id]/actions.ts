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

  const parsed = parseExtraction(JSON.parse(payload));
  if (!parsed.ok) {
    return { ok: false, message: parsed.error };
  }
  const invoice = parsed.data;

  const [draft] = await query<{ blob_url: string; extraction_meta: unknown }>(
    "SELECT blob_url, extraction_meta FROM draft WHERE id = $1",
    [draftId],
  );
  if (!draft) return { ok: false, message: "That draft is gone." };

  const tolerance = (await getSetting<number>("rounding_tolerance")) ?? DEFAULT_TOLERANCE_RUPEES;
  // Re-checked on the edited figures, not the extracted ones: correcting one
  // number by hand can easily break the sum.
  const checks = validateArithmetic(invoice, tolerance);

  const client = await pool.connect();
  let savedId: string;
  try {
    await client.query("BEGIN");

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
          `INSERT INTO vendor (name, normalized_name) VALUES ($1, $2) RETURNING id`,
          [invoice.vendor_name, normalize(invoice.vendor_name)],
        );

    const vendorId = vendor.rows[0].id;

    const saved = await client.query<{ id: string }>(
      `INSERT INTO invoice (vendor_id, invoice_number, invoice_date, subtotal, cgst,
                            sgst, igst, total, blob_url, status, extraction_meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
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
      ],
    );
    savedId = saved.rows[0].id;

    for (const line of invoice.line_items) {
      const key = normalize(line.description);
      // Exact match on the normalised name for now. Trigram matching and the
      // suggestion band are #24 and #25.
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM item WHERE normalized_name = $1 LIMIT 1",
        [key],
      );
      const item = existing.rows.length
        ? existing
        : await client.query<{ id: string }>(
            "INSERT INTO item (canonical_name, normalized_name) VALUES ($1,$2) RETURNING id",
            [line.description, key],
          );

      await client.query(
        `INSERT INTO line_item (invoice_id, raw_description, hsn_code, quantity, unit,
                                unit_price, amount, item_id, match_confidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          savedId,
          line.description,
          line.hsn_code,
          line.quantity,
          line.unit,
          line.unit_price,
          line.amount,
          item.rows[0].id,
          existing.rows.length ? 1 : null,
        ],
      );
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
         WHERE v.gstin IS NOT DISTINCT FROM $1 AND i.invoice_number = $2`,
        [invoice.gstin, invoice.invoice_number],
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

  revalidatePath("/");
  revalidatePath("/items");
  revalidatePath("/vendors");
  redirect(`/vendors?saved=${savedId}`);
}

export async function discardDraft(_previous: SaveResult, form: FormData): Promise<SaveResult> {
  await requireSession();
  const draftId = form.get("draftId");
  if (typeof draftId !== "string") return { ok: false, message: "Nothing to discard." };

  await query("DELETE FROM draft WHERE id = $1", [draftId]);
  redirect("/upload");
}

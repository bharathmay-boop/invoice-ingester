// The read queries behind the browse screens. Hand written SQL on purpose: the
// interesting ones aggregate, and an ORM would only get in the way.
import "server-only";
import { query } from "./db.ts";
import { normalize } from "./items/normalize.ts";

// Only confirmed invoices count towards spend. An invoice whose figures
// disagree with themselves has no business in a total.
const CONFIRMED = "i.status = 'confirmed'";

export type VendorRow = {
  id: string;
  name: string;
  gstin: string | null;
  /** Every invoice, whatever its status, so it matches the list on the page. */
  invoice_count: number;
  needs_review: number;
  /** Confirmed only. An invoice that disagrees with itself is not a total. */
  spend: number;
};

export function listVendors(): Promise<VendorRow[]> {
  return query<VendorRow>(`
    SELECT v.id, v.name, v.gstin,
           count(i.id)::int                                       AS invoice_count,
           count(i.id) FILTER (WHERE i.status = 'needs_review')::int AS needs_review,
           coalesce(sum(i.total) FILTER (WHERE ${CONFIRMED}), 0)::float AS spend
    FROM vendor v
    LEFT JOIN invoice i ON i.vendor_id = v.id
    GROUP BY v.id, v.name, v.gstin
    ORDER BY spend DESC, v.name
  `);
}

export type VendorDetail = VendorRow & { address: string | null };

export async function getVendor(id: string): Promise<VendorDetail | null> {
  const rows = await query<VendorDetail>(
    `
    SELECT v.id, v.name, v.gstin, v.address,
           count(i.id)::int                                       AS invoice_count,
           count(i.id) FILTER (WHERE i.status = 'needs_review')::int AS needs_review,
           coalesce(sum(i.total) FILTER (WHERE ${CONFIRMED}), 0)::float AS spend
    FROM vendor v
    LEFT JOIN invoice i ON i.vendor_id = v.id
    WHERE v.id = $1
    GROUP BY v.id, v.name, v.gstin, v.address
  `,
    [id],
  );
  return rows[0] ?? null;
}

/** What the screens need to show an invoice and open its original. */
export type Original = {
  blob_url: string | null;
  content_type: string | null;
  /** Where this invoice starts in a file holding several. */
  first_page: number | null;
};

export type InvoiceRow = Original & {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: number;
  status: string;
};

export function listVendorInvoices(vendorId: string): Promise<InvoiceRow[]> {
  return query<InvoiceRow>(
    `SELECT id, invoice_number, invoice_date, total::float, status,
            blob_url, content_type, first_page
     FROM invoice WHERE vendor_id = $1
     ORDER BY invoice_date DESC`,
    [vendorId],
  );
}

export type ItemRow = {
  id: string;
  canonical_name: string;
  purchases: number;
  spend: number;
  latest_price: number | null;
};

export function listItems(search?: string): Promise<ItemRow[]> {
  // Search filters the same list rather than being a separate screen, so there
  // is one way into an item.
  //
  // The term goes through the same normaliser the catalogue keys are built
  // with, so "Paper, A4" and "a4 paper" find the same item. Without it the
  // screen promises loose matching and then does a raw substring match, and
  // tells you an item does not exist when it does. Every normalised token has
  // to appear, which keeps multi word searches from matching everything.
  const terms = search?.trim() ? normalize(search).split(" ").filter(Boolean) : [];
  const filter = terms.length
    ? `WHERE (SELECT bool_and(it.normalized_name LIKE '%' || t || '%')
               FROM unnest($1::text[]) AS t)
          OR it.canonical_name ILIKE '%' || $2 || '%'`
    : "";

  return query<ItemRow>(
    `
    SELECT it.id, it.canonical_name,
           count(li.id) FILTER (WHERE ${CONFIRMED})::int AS purchases,
           coalesce(sum(li.amount) FILTER (WHERE ${CONFIRMED}), 0)::float AS spend,
           (
             SELECT l2.unit_price::float
             FROM line_item l2 JOIN invoice i2 ON i2.id = l2.invoice_id
             WHERE l2.item_id = it.id AND i2.status = 'confirmed'
             ORDER BY i2.invoice_date DESC LIMIT 1
           ) AS latest_price
    FROM item it
    LEFT JOIN line_item li ON li.item_id = it.id
    LEFT JOIN invoice i ON i.id = li.invoice_id
    ${filter}
    GROUP BY it.id, it.canonical_name
    ORDER BY spend DESC, it.canonical_name
  `,
    terms.length ? [terms, search!.trim()] : [],
  );
}

export type PurchaseRow = Original & {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  vendor_id: string;
  vendor_name: string;
  raw_description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  amount: number;
  status: string;
};

export async function getItem(id: string) {
  const rows = await query<{ id: string; canonical_name: string }>(
    "SELECT id, canonical_name FROM item WHERE id = $1",
    [id],
  );
  if (!rows[0]) return null;

  const purchases = await query<PurchaseRow>(
    `SELECT i.id AS invoice_id, i.invoice_number, i.invoice_date,
            v.id AS vendor_id, v.name AS vendor_name,
            li.raw_description, li.quantity::float, li.unit,
            li.unit_price::float, li.amount::float, i.status,
            i.blob_url, i.content_type, i.first_page
     FROM line_item li
     JOIN invoice i ON i.id = li.invoice_id
     JOIN vendor v ON v.id = i.vendor_id
     WHERE li.item_id = $1
     ORDER BY i.invoice_date DESC`,
    [id],
  );

  return { ...rows[0], purchases };
}

export function countNeedsReview(): Promise<{ n: number }[]> {
  return query<{ n: number }>(
    "SELECT count(*)::int AS n FROM invoice WHERE status = 'needs_review'",
  );
}

export type SuggestionRow = {
  line_item_id: string;
  item_id: string;
  score: number;
  /** What the invoice called it. */
  raw_description: string;
  /** What the catalogue calls the candidate. */
  canonical_name: string;
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  vendor_name: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  /** How much the candidate already has behind it, so a decision has context. */
  item_purchases: number;
};

/**
 * Undecided matches, oldest first. A rejected one keeps its row and never
 * appears again: the queue is for questions nobody has answered, and asking
 * twice is how a queue turns into noise.
 */
export function listSuggestions(): Promise<SuggestionRow[]> {
  return query<SuggestionRow>(
    `SELECT s.line_item_id, s.item_id, s.score::float,
            li.raw_description, li.quantity::float, li.unit, li.unit_price::float,
            it.canonical_name,
            i.id AS invoice_id, i.invoice_number, i.invoice_date,
            v.name AS vendor_name,
            (SELECT count(*)::int FROM line_item l2 WHERE l2.item_id = it.id) AS item_purchases
     FROM match_suggestion s
     JOIN line_item li ON li.id = s.line_item_id
     JOIN item it ON it.id = s.item_id
     JOIN invoice i ON i.id = li.invoice_id
     JOIN vendor v ON v.id = i.vendor_id
     WHERE s.decision IS NULL
     ORDER BY s.created_at`,
  );
}

export function countWaitingSuggestions(): Promise<{ n: number }[]> {
  return query<{ n: number }>(
    "SELECT count(*)::int AS n FROM match_suggestion WHERE decision IS NULL",
  );
}

// The read queries behind the browse screens. Hand written SQL on purpose: the
// interesting ones aggregate, and an ORM would only get in the way.
import "server-only";
import { query } from "./db.ts";

// Only confirmed invoices count towards spend. An invoice whose figures
// disagree with themselves has no business in a total.
const CONFIRMED = "i.status = 'confirmed'";

export type VendorRow = {
  id: string;
  name: string;
  gstin: string | null;
  invoice_count: number;
  needs_review: number;
  spend: number;
};

export function listVendors(): Promise<VendorRow[]> {
  return query<VendorRow>(`
    SELECT v.id, v.name, v.gstin,
           count(i.id) FILTER (WHERE ${CONFIRMED})::int      AS invoice_count,
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
           count(i.id) FILTER (WHERE ${CONFIRMED})::int      AS invoice_count,
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

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: number;
  status: string;
};

export function listVendorInvoices(vendorId: string): Promise<InvoiceRow[]> {
  return query<InvoiceRow>(
    `SELECT id, invoice_number, invoice_date, total::float, status
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
  const filter = search?.trim()
    ? "WHERE it.normalized_name ILIKE '%' || $1 || '%' OR it.canonical_name ILIKE '%' || $1 || '%'"
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
    search?.trim() ? [search.trim()] : [],
  );
}

export type PurchaseRow = {
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
            li.unit_price::float, li.amount::float, i.status
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

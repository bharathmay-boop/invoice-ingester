import "server-only";
import { query } from "../db.ts";
import type { Currency } from "../money/currencies.ts";
import type { InvoiceFilter } from "./filter.ts";

export type InvoiceListRow = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
  currency: Currency;
  total: number;
  status: string;
  blob_url: string | null;
  content_type: string | null;
  first_page: number | null;
  /** Lines the contract check flagged. Matching the contract is not a finding. */
  findings: number;
};

/**
 * Saved invoices, newest first, narrowed by supplier and date range.
 *
 * One more row than a page is asked for, so the screen can say there are more
 * without a second query to count them.
 */
export function listInvoices(filter: InvoiceFilter, limit: number): Promise<InvoiceListRow[]> {
  return query<InvoiceListRow>(
    `SELECT i.id, i.vendor_id, v.name AS vendor_name, i.invoice_number,
            i.invoice_date, i.currency, i.total::float, i.status,
            i.blob_url, i.content_type, i.first_page,
            (SELECT count(*)::int FROM line_item li
             WHERE li.invoice_id = i.id
               AND li.variance_tag IS NOT NULL
               AND li.variance_tag <> 'matches_contract') AS findings
     FROM invoice i JOIN vendor v ON v.id = i.vendor_id
     WHERE ($1::uuid IS NULL OR i.vendor_id = $1)
       AND ($2::date IS NULL OR i.invoice_date >= $2)
       AND ($3::date IS NULL OR i.invoice_date <= $3)
     ORDER BY i.invoice_date DESC, i.created_at DESC, i.id
     LIMIT $4`,
    [filter.vendorId, filter.from, filter.to, limit + 1],
  );
}

export type InvoiceLine = {
  id: string;
  raw_description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  amount: number;
  item_id: string | null;
  item_name: string | null;
  variance_tag: string | null;
};

export type InvoiceDetail = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
  currency: Currency;
  subtotal: number;
  // `included` means the tax is already inside the line prices, so it explains
  // part of the total rather than adding to it.
  taxes: { label: string; rate: number | string | null; amount: number; included?: boolean }[];
  adjustments: { label: string; amount: number }[];
  total: number;
  status: string;
  blob_url: string | null;
  content_type: string | null;
  first_page: number | null;
  lines: InvoiceLine[];
};

/** A saved invoice as it was saved, with its lines. Null when there is no such invoice. */
export async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  const [invoice] = await query<Omit<InvoiceDetail, "lines">>(
    `SELECT i.id, i.vendor_id, v.name AS vendor_name, i.invoice_number,
            i.invoice_date, i.currency, i.subtotal::float, i.taxes, i.adjustments,
            i.total::float, i.status, i.blob_url, i.content_type, i.first_page
     FROM invoice i JOIN vendor v ON v.id = i.vendor_id
     WHERE i.id = $1`,
    [id],
  );
  if (!invoice) return null;

  const lines = await query<InvoiceLine>(
    `SELECT li.id, li.raw_description, li.quantity::float, li.unit,
            li.unit_price::float, li.amount::float, li.item_id,
            it.canonical_name AS item_name, li.variance_tag
     FROM line_item li LEFT JOIN item it ON it.id = li.item_id
     WHERE li.invoice_id = $1
     ORDER BY lower(li.raw_description), li.id`,
    [id],
  );
  return { ...invoice, lines };
}

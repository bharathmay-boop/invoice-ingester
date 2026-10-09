/**
 * What the invoices list was asked for, read out of the query string.
 *
 * The query string is whatever someone typed into the address bar, so each part
 * is accepted only if it is exactly what it should be and dropped otherwise. A
 * bad supplier id or a date that is not a date means no filter on that part,
 * not an error page and never a value handed on to SQL.
 */
export type InvoiceFilter = {
  vendorId: string | null;
  from: string | null;
  to: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A real calendar date: 2026-02-31 matches the shape and is not one. */
function realDate(value: string | undefined): string | null {
  if (!value || !DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

export function parseInvoiceFilter(
  params: Record<string, string | string[] | undefined>,
): InvoiceFilter {
  const vendor = one(params.vendor);
  const from = realDate(one(params.from));
  const to = realDate(one(params.to));
  return {
    vendorId: vendor && UUID.test(vendor) ? vendor : null,
    // A range that runs backwards matches nothing. Taken as given it would show
    // an empty list with no hint why, so it is read the way it was meant.
    from: from && to && from > to ? to : from,
    to: from && to && from > to ? from : to,
  };
}

/** How many rows one page of the list shows. */
export const INVOICE_PAGE = 100;

// The read queries behind the browse screens. Hand written SQL on purpose: the
// interesting ones aggregate, and an ORM would only get in the way.
import "server-only";
import { query } from "./db.ts";
import { normalize } from "./items/normalize.ts";
import type { Currency } from "./format.ts";
import type { TaxIdKind } from "./extract/schema.ts";

// Only confirmed invoices count towards spend. An invoice whose figures
// disagree with itself has no business in a total.
const CONFIRMED = "i.status = 'confirmed'";

export type VendorRow = {
  id: string;
  name: string;
  tax_id: string | null;
  tax_id_kind: TaxIdKind | null;
  currency: Currency;
  /** Every invoice, whatever its status, so it matches the list on the page. */
  invoice_count: number;
  needs_review: number;
  /** Confirmed only. An invoice that disagrees with itself is not a total. */
  spend: number;
};

export function listVendors(): Promise<VendorRow[]> {
  return query<VendorRow>(`
    SELECT v.id, v.name, v.tax_id, v.tax_id_kind,
           coalesce(i.currency, 'INR') AS currency,
           count(i.id)::int                                       AS invoice_count,
           count(i.id) FILTER (WHERE i.status = 'needs_review')::int AS needs_review,
           coalesce(sum(i.total) FILTER (WHERE ${CONFIRMED}), 0)::float AS spend
    FROM vendor v
    LEFT JOIN invoice i ON i.vendor_id = v.id
    GROUP BY v.id, v.name, v.tax_id, v.tax_id_kind, coalesce(i.currency, 'INR')
    ORDER BY spend DESC, v.name, currency
  `);
}

export type CurrencySpend = {
  currency: Currency;
  spend: number;
};

export type VendorDetail = Omit<VendorRow, "currency" | "spend"> & {
  spends: CurrencySpend[];
  address: string | null;
};

export async function getVendor(id: string): Promise<VendorDetail | null> {
  const rows = await query<VendorDetail>(
    `
    SELECT v.id, v.name, v.tax_id, v.tax_id_kind, v.address,
           count(i.id)::int                                       AS invoice_count,
           count(i.id) FILTER (WHERE i.status = 'needs_review')::int AS needs_review,
           (
             SELECT coalesce(
               jsonb_agg(jsonb_build_object('currency', grouped.currency, 'spend', grouped.spend) ORDER BY grouped.currency),
               '[]'::jsonb
             )
             FROM (
               SELECT inner.currency, sum(inner.total)::float AS spend
               FROM invoice inner
               WHERE inner.vendor_id = v.id AND inner.status = 'confirmed'
               GROUP BY inner.currency
             ) grouped
           ) AS spends
    FROM vendor v
    LEFT JOIN invoice i ON i.vendor_id = v.id
    WHERE v.id = $1
    GROUP BY v.id, v.name, v.tax_id, v.tax_id_kind, v.address
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
  currency: Currency;
  total: number;
  status: string;
};

export function listVendorInvoices(vendorId: string): Promise<InvoiceRow[]> {
  return query<InvoiceRow>(
    `SELECT id, invoice_number, invoice_date, currency, total::float, status,
            blob_url, content_type, first_page
     FROM invoice WHERE vendor_id = $1
     ORDER BY invoice_date DESC`,
    [vendorId],
  );
}

export type ItemRow = {
  id: string;
  canonical_name: string;
  currency: Currency;
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
    SELECT it.id, it.canonical_name, coalesce(i.currency, 'INR') AS currency,
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
    GROUP BY it.id, it.canonical_name, coalesce(i.currency, 'INR')
    ORDER BY spend DESC, it.canonical_name, currency
  `,
    terms.length ? [terms, search!.trim()] : [],
  );
}

export type PurchaseRow = Original & {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  currency: Currency;
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
    `SELECT i.id AS invoice_id, i.invoice_number, i.invoice_date, i.currency,
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

  // The names a person has taught the matcher for this item. Fetched here
  // rather than on the client so the screen renders them with everything else.
  const aliases = await query<{ id: string; alias: string }>(
    "SELECT id, alias FROM item_alias WHERE item_id = $1 ORDER BY alias",
    [id],
  );

  return { ...rows[0], purchases, aliases };
}

export function countNeedsReview(): Promise<{ n: number }[]> {
  return query<{ n: number }>(
    "SELECT count(*)::int AS n FROM invoice WHERE status = 'needs_review'",
  );
}

/**
 * Every other catalogue item, for merging this one into one of them. Ordered
 * by how much is behind each, since the entry with the most purchases is
 * usually the one worth keeping.
 */
export function listMergeCandidates(exceptId: string) {
  return query<{ id: string; name: string; purchases: number }>(
    `SELECT it.id, it.canonical_name AS name,
            (SELECT count(*)::int FROM line_item li WHERE li.item_id = it.id) AS purchases
     FROM item it
     WHERE it.id <> $1
     ORDER BY purchases DESC, it.canonical_name`,
    [exceptId],
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
  currency: Currency;
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
            i.id AS invoice_id, i.invoice_number, i.invoice_date, i.currency,
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

export type ContractRow = {
  id: string;
  title: string;
  status: string;
  failure: string | null;
  vendor_name: string | null;
  rate_count: number;
  created_at: string;
};

/**
 * Every contract, newest first, with the one number worth seeing from a list:
 * how many rates came out of it. A contract with no rates is a real document,
 * a services agreement with a revenue share and no rate card, so zero is an
 * answer rather than a failure.
 */
export function listContracts(): Promise<ContractRow[]> {
  return query<ContractRow>(
    `SELECT c.id, c.title, c.status, c.failure, v.name AS vendor_name,
            count(r.id)::int AS rate_count, c.created_at
     FROM contract c
     LEFT JOIN vendor v ON v.id = c.vendor_id
     LEFT JOIN contract_rate r ON r.contract_id = c.id
     GROUP BY c.id, v.name
     ORDER BY c.created_at DESC`,
  );
}

export type ContractDetail = {
  id: string;
  title: string;
  status: string;
  failure: string | null;
  vendor_name: string | null;
  blob_url: string;
  content_type: string;
  extraction: unknown;
  other_terms: { kind: string; label: string; summary: string; page: number | null; quote: string | null }[];
  created_at: string;
};

export async function getContract(id: string) {
  const rows = await query<ContractDetail>(
    `SELECT c.id, c.title, c.status, c.failure, v.name AS vendor_name,
            c.blob_url, c.content_type, c.extraction, c.other_terms, c.created_at
     FROM contract c LEFT JOIN vendor v ON v.id = c.vendor_id
     WHERE c.id = $1`,
    [id],
  );
  if (!rows[0]) return null;

  const rates = await query<{
    id: string;
    printed_name: string;
    unit: string | null;
    rate: number;
    currency: Currency;
    effective_from: string;
    effective_to: string | null;
    source_page: number | null;
    source_quote: string | null;
    item_id: string | null;
    item_name: string | null;
    reviewed: boolean;
  }>(
    `SELECT r.id, r.printed_name, r.unit, r.rate::float, r.currency,
            r.effective_from, r.effective_to, r.source_page, r.source_quote,
            r.item_id, i.canonical_name AS item_name, r.reviewed
     FROM contract_rate r LEFT JOIN item i ON i.id = r.item_id
     WHERE r.contract_id = $1
     ORDER BY r.printed_name, r.effective_from`,
    [id],
  );

  return { ...rows[0], rates };
}

/** Suppliers to pick from when confirming a contract, most used first. */
export function listVendorChoices(): Promise<{ id: string; name: string }[]> {
  return query<{ id: string; name: string }>(
    `SELECT v.id, v.name FROM vendor v
     LEFT JOIN invoice i ON i.vendor_id = v.id
     GROUP BY v.id, v.name
     ORDER BY count(i.id) DESC, v.name`,
  );
}

/**
 * The catalogue, for matching a contract's rate to a thing you buy. Most
 * purchased first, because a contract's rate card and the things actually
 * bought overlap heavily and the right answer is usually near the top.
 */
export function listItemChoices(): Promise<{ id: string; name: string }[]> {
  return query<{ id: string; name: string }>(
    `SELECT it.id, it.canonical_name AS name FROM item it
     LEFT JOIN line_item li ON li.item_id = it.id
     GROUP BY it.id, it.canonical_name
     ORDER BY count(li.id) DESC, it.canonical_name`,
  );
}

export type FindingRow = {
  line_id: string;
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  vendor_id: string;
  vendor_name: string;
  item_name: string | null;
  raw_description: string;
  currency: Currency;
  unit: string | null;
  quantity: number;
  unit_price: number;
  variance_tag: string;
  variance_contracted: number | null;
  variance_impact: number | null;
  variance_reason: string | null;
};

/**
 * Everything a contract disagrees with, worst first.
 *
 * Ordered by money rather than by count. Seventeen lines billed above contract
 * is a number nobody can act on; forty one thousand rupees, twenty eight of it
 * from one supplier, is a phone call. Count ordering also sorts badly, because
 * a hundred lines two rupees out beats one line forty thousand out.
 *
 * `matches_contract` is excluded: it is the answer being right, not a finding.
 */
export function listFindings(tag?: string): Promise<FindingRow[]> {
  return query<FindingRow>(
    `SELECT li.id AS line_id, i.id AS invoice_id, i.invoice_number, i.invoice_date,
            v.id AS vendor_id, v.name AS vendor_name,
            it.canonical_name AS item_name, li.raw_description, i.currency,
            li.unit, li.quantity::float, li.unit_price::float,
            li.variance_tag, li.variance_contracted::float, li.variance_impact::float,
            li.variance_reason
     FROM line_item li
     JOIN invoice i ON i.id = li.invoice_id
     JOIN vendor v ON v.id = i.vendor_id
     LEFT JOIN item it ON it.id = li.item_id
     WHERE li.variance_tag IS NOT NULL
       AND li.variance_tag <> 'matches_contract'
       AND ($1::text IS NULL OR li.variance_tag = $1)
     ORDER BY abs(coalesce(li.variance_impact, 0)) DESC, i.invoice_date DESC`,
    [tag ?? null],
  );
}

/** The totals above the list, per currency because they are never added up. */
export function findingTotals(): Promise<
  { currency: Currency; variance_tag: string; total: number; lines: number }[]
> {
  return query(
    `SELECT i.currency, li.variance_tag,
            coalesce(sum(li.variance_impact), 0)::float AS total,
            count(*)::int AS lines
     FROM line_item li JOIN invoice i ON i.id = li.invoice_id
     WHERE li.variance_tag IS NOT NULL AND li.variance_tag <> 'matches_contract'
     GROUP BY i.currency, li.variance_tag
     ORDER BY i.currency, abs(coalesce(sum(li.variance_impact), 0)) DESC`,
  );
}

export async function getFinding(lineId: string): Promise<(FindingRow & {
  contract_title: string | null;
  source_page: number | null;
  source_quote: string | null;
  contract_id: string | null;
}) | null> {
  const rows = await query<FindingRow & {
    contract_title: string | null;
    source_page: number | null;
    source_quote: string | null;
    contract_id: string | null;
  }>(
    `SELECT li.id AS line_id, i.id AS invoice_id, i.invoice_number, i.invoice_date,
            v.id AS vendor_id, v.name AS vendor_name,
            it.canonical_name AS item_name, li.raw_description, i.currency,
            li.unit, li.quantity::float, li.unit_price::float,
            li.variance_tag, li.variance_contracted::float, li.variance_impact::float,
            li.variance_reason,
            c.title AS contract_title, c.id AS contract_id,
            r.source_page, r.source_quote
     FROM line_item li
     JOIN invoice i ON i.id = li.invoice_id
     JOIN vendor v ON v.id = i.vendor_id
     LEFT JOIN item it ON it.id = li.item_id
     LEFT JOIN contract_rate r ON r.reviewed AND r.vendor_id = v.id
          AND r.item_id = li.item_id
          AND r.effective_from <= i.invoice_date
          AND (r.effective_to IS NULL OR r.effective_to >= i.invoice_date)
     LEFT JOIN contract c ON c.id = r.contract_id
     WHERE li.id = $1
     LIMIT 1`,
    [lineId],
  );
  return rows[0] ?? null;
}

/** How many findings are waiting, for the count beside a vendor or an invoice. */
export function countFindings(): Promise<{ n: number }[]> {
  return query<{ n: number }>(
    `SELECT count(*)::int AS n FROM line_item
     WHERE variance_tag IS NOT NULL AND variance_tag <> 'matches_contract'`,
  );
}

// Which vendor is cheapest is a sourcing recommendation, so it gets its own
// function and its own tests rather than living inline in a page.

export type Priced = {
  vendor_id: string;
  vendor_name: string;
  unit_price: number;
  invoice_date: string;
  unit?: string | null;
};

/**
 * The lowest of each vendor's most recent price.
 *
 * Not the lowest price ever paid. That names a vendor who has since put their
 * price up, and sends you back to someone who is no longer the cheapest.
 *
 * `purchases` may be in any order; the latest per vendor is chosen by date.
 */
export function cheapestVendorNow<T extends Priced>(purchases: T[]): T | null {
  const latest = new Map<string, T>();

  for (const purchase of purchases) {
    const held = latest.get(purchase.vendor_id);
    if (!held || purchase.invoice_date > held.invoice_date) {
      latest.set(purchase.vendor_id, purchase);
    }
  }

  let best: T | null = null;
  for (const purchase of latest.values()) {
    if (!best || purchase.unit_price < best.unit_price) best = purchase;
  }
  return best;
}

/**
 * Prices in different units cannot be compared. Saying so is useful; a
 * confident wrong comparison is not. See #36.
 */
export function unitsAreComparable(purchases: Priced[]): boolean {
  return new Set(purchases.map((p) => p.unit ?? "each")).size <= 1;
}

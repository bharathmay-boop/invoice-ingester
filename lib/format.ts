// One place for money, dates and status wording. Getting Indian digit grouping
// right in four screens by hand means getting it wrong in a fifth.

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const rupeesWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const date = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const shortDate = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
});

/** ₹2,84,600.00 — lakh grouping, not thousands. */
export function money(value: number | string): string {
  return rupees.format(Number(value));
}

/**
 * A unit price, which can be far below a paisa once it is expressed per gram
 * or per millilitre: ₹4 a kilogram is ₹0.004 a gram. The ordinary formatter
 * shows that as ₹0.00, which reads as free and makes the movement figure
 * beside it look invented. Small numbers get the digits they need, up to a
 * point, and then a number that small is reported as such.
 */
export function unitMoney(value: number | string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return money(0);
  if (amount === 0 || Math.abs(amount) >= 0.01) return money(amount);
  if (Math.abs(amount) < 0.00005) return "under ₹0.0001";
  return `₹${amount.toFixed(4)}`;
}

/** ₹2,84,600 for headline figures, where the paise are noise. */
export function moneyRounded(value: number | string): string {
  return rupeesWhole.format(Number(value));
}

/** 04 Sep 2026 */
export function formatDate(value: Date | string): string {
  return date.format(typeof value === "string" ? new Date(value) : value);
}

/** 04 Sep, for dense lists where the year is already established. */
export function formatDateShort(value: Date | string): string {
  return shortDate.format(typeof value === "string" ? new Date(value) : value);
}

export type InvoiceStatus = "pending" | "needs_review" | "confirmed";

/**
 * `needs_review` is a database value, not a phrase anyone says. Each status
 * gets a label and a line saying what to do about it.
 */
export const STATUS: Record<
  InvoiceStatus,
  { label: string; meaning: string; tone: "neutral" | "warning" | "good" }
> = {
  pending: {
    label: "Not checked yet",
    meaning: "Extracted, but the figures have not been checked.",
    tone: "neutral",
  },
  needs_review: {
    label: "Figures disagree",
    meaning: "The numbers on this invoice do not add up. Open it to see which.",
    tone: "warning",
  },
  confirmed: {
    label: "Checked",
    meaning: "The line items, taxes and total all agree.",
    tone: "good",
  },
};

export function statusLabel(status: string): string {
  return STATUS[status as InvoiceStatus]?.label ?? status;
}

/** Percentage change, with the sign, for price movement. */
export function changeSince(latest: number, earliest: number): string | null {
  if (!earliest) return null;
  const percent = ((latest - earliest) / earliest) * 100;
  const rounded = Math.abs(percent) < 0.05 ? 0 : percent;
  if (rounded === 0) return "no change";
  return `${rounded > 0 ? "up" : "down"} ${Math.abs(rounded).toFixed(1)}%`;
}

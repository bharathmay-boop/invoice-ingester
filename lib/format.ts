// One place for money, dates and status wording. Getting Indian digit grouping
// right in four screens by hand means getting it wrong in a fifth.

export type Currency = "INR" | "USD" | "EUR";

const moneyFormatters = new Map<Currency, Intl.NumberFormat>();
const wholeFormatters = new Map<Currency, Intl.NumberFormat>();

function moneyFormatter(currency: Currency): Intl.NumberFormat {
  const existing = moneyFormatters.get(currency);
  if (existing) return existing;

  const formatter = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
  moneyFormatters.set(currency, formatter);
  return formatter;
}

function wholeFormatter(currency: Currency): Intl.NumberFormat {
  const existing = wholeFormatters.get(currency);
  if (existing) return existing;

  const formatter = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  wholeFormatters.set(currency, formatter);
  return formatter;
}

function symbolFor(currency: Currency): string {
  return moneyFormatter(currency)
    .formatToParts(0)
    .find((part) => part.type === "currency")?.value ?? currency;
}

const date = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const shortDate = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
});

/** ₹2,84,600.00: lakh grouping, not thousands. */
export function money(value: number | string, currency: Currency): string {
  return moneyFormatter(currency).format(Number(value));
}

/**
 * A unit price, which can be far below a paisa once it is expressed per gram
 * or per millilitre: ₹4 a kilogram is ₹0.004 a gram. The ordinary formatter
 * shows that as ₹0.00, which reads as free and makes the movement figure
 * beside it look invented. Small numbers get the digits they need, up to a
 * point, and then a number that small is reported as such.
 */
export function unitMoney(value: number | string, currency: Currency): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return money(0, currency);
  if (amount === 0 || Math.abs(amount) >= 0.01) return money(amount, currency);
  if (Math.abs(amount) < 0.00005) return `under ${symbolFor(currency)}0.0001`;

  // The sign goes outside the symbol. Formatting the number first and pasting
  // the symbol on the front gives "₹-0.0030", which is not how anyone writes
  // money, so the minus is taken off and put back in the right place.
  const sign = amount < 0 ? "-" : "";
  return `${sign}${symbolFor(currency)}${Math.abs(amount).toFixed(4)}`;
}

/** ₹2,84,600 for headline figures, where the paise are noise. */
export function moneyRounded(value: number | string, currency: Currency): string {
  return wholeFormatter(currency).format(Number(value));
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

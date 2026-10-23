/**
 * Whether a YYYY-MM-DD string is a day that exists. Date.parse is not enough:
 * it rolls 2026-02-30 forward to 2 March and calls it valid, and the insert
 * into a Postgres date column then fails on a document that was read fine
 * (#117). Built back from its parts, a real date comes out unchanged.
 */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

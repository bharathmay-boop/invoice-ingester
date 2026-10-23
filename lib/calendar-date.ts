/**
 * Whether a YYYY-MM-DD string is a day that exists. Date.parse is not enough:
 * it rolls 2026-02-30 forward to 2 March and calls it valid, and the insert
 * into a Postgres date column then fails on a document that was read fine
 * (#117). Counted from the calendar rather than built with Date, which reads
 * years 0 to 99 as 1900 to 1999 (Kimi K2.5 review on #279).
 */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= days[m - 1];
}

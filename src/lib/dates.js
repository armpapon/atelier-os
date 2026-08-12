/**
 * Bangkok-calendar date helpers.
 *
 * The user lives in Bangkok (UTC+7, no DST). Two things used to go wrong:
 *   1. `new Date().toISOString()` is UTC, so between 00:00 and 07:00 local it
 *      reports YESTERDAY.
 *   2. `Date#getFullYear/getMonth/getDate` follow the DEVICE timezone, so a
 *      laptop set to New York opened August while Bangkok was already in
 *      September (audit B10).
 *
 * Every "today" in the app is therefore derived from the Asia/Bangkok
 * calendar via `Intl` — never from the device's local getters. The exported
 * names are unchanged; only the implementation moved zones.
 */

export const BANGKOK_TZ = 'Asia/Bangkok';

/**
 * Format an instant as its BANGKOK calendar date, `YYYY-MM-DD`.
 * (Name kept for compatibility — "local" has always meant Bangkok here.)
 */
export function toLocalYMD(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return null;
  // 'sv-SE' is the ISO-shaped locale: YYYY-MM-DD, zero-padded.
  return d.toLocaleDateString('sv-SE', { timeZone: BANGKOK_TZ });
}

/** Today in the Bangkok calendar, as `YYYY-MM-DD`. Device TZ irrelevant. */
export function todayStr() {
  return toLocalYMD(new Date());
}

/** The current Bangkok calendar month, `YYYY-MM`. */
export function currentMonthStr(at) {
  return toLocalYMD(at || new Date()).substring(0, 7);
}

/** The current Bangkok day-of-month, as a number (1–31). */
export function todayDayOfMonth(at) {
  return Number(toLocalYMD(at || new Date()).substring(8, 10));
}

/** Split a `YYYY-MM-DD` into `[year, month, day]` numbers. */
export function ymdParts(ymd) {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  return [y, m, d];
}

/**
 * Bangkok `YYYY-MM-DD` N days from `from` (default: today). Negative = past.
 * Arithmetic runs in UTC on the calendar parts, so it can never be nudged by
 * the device timezone or by DST in the device's zone.
 */
export function addDaysStr(days, from) {
  const [y, m, d] = ymdParts(from || todayStr());
  if (!y || !m || !d) return null;
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  const mo = String(t.getUTCMonth() + 1).padStart(2, '0');
  const da = String(t.getUTCDate()).padStart(2, '0');
  return `${t.getUTCFullYear()}-${mo}-${da}`;
}

/**
 * Local-date helpers.
 *
 * The user lives in Bangkok (UTC+7, no DST). `new Date().toISOString()` returns
 * a UTC timestamp, so between 00:00 and 07:00 local it reports YESTERDAY.
 * Every "today" in the app must be derived from the LOCAL calendar instead.
 */

/** Format a Date as local `YYYY-MM-DD` (no UTC conversion). */
export function toLocalYMD(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return null;
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Today in the user's local calendar, as `YYYY-MM-DD`. */
export function todayStr() {
  return toLocalYMD(new Date());
}

/** Local `YYYY-MM-DD` N days from today (negative = past). */
export function addDaysStr(days, from) {
  const d = from ? new Date(`${from}T00:00:00`) : new Date();
  d.setDate(d.getDate() + days);
  return toLocalYMD(d);
}

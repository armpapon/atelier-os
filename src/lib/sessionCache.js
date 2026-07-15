// In-memory cache for integration results — lives for the page session only
// (cleared on full reload / logout, never written to disk).
//
// Why: the Gmail / Asana / Sheets cards each run a slow provider scan on mount.
// Navigating away and back to the Journal remounts them and re-scans every time,
// which is what made "เข้าแล้ว sync ช้า". Caching the last result lets a remount
// render instantly and only refresh in the background when the data is stale.

const store = new Map(); // key → { data, ts }

// Auto-refresh a card only when its cached data is older than this (~"2-3x/day").
export const STALE_MS = 4 * 60 * 60 * 1000;

export function getCache(key) { return store.get(key) || null; }
export function setCache(key, data) { store.set(key, { data, ts: Date.now() }); }
export function cacheAge(key) { const e = store.get(key); return e ? Date.now() - e.ts : Infinity; }

// Drop cached entries (all, or every key starting with `prefix`). Used when a
// setting change invalidates results across dates, e.g. editing Asana role
// targets must recompute every day's summary, not just the one on screen.
export function clearCache(prefix) {
  if (!prefix) { store.clear(); return; }
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}

// "14:32" clock for the last successful sync.
export function fmtSyncClock(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

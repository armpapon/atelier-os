/**
 * บัตรเครดิต — pure rules. No React, no Supabase, no `new Date()` shortcuts.
 *
 * Same contract as src/lib/taxTH.js: every number the card grid shows is
 * computed HERE, so it can be pinned in audit/cases.mjs without mounting a
 * page. If a component is doing arithmetic, it is in the wrong file.
 *
 * Two things this module is opinionated about:
 *
 *   1. A card's balance has ONE source. If the card is linked to a debt row,
 *      the Debt Tracker's `remaining_balance` wins — a card and its own debt
 *      must never show two different numbers on the same screen. Only an
 *      unlinked card falls back to the manually typed `manual_balance`.
 *
 *   2. Cycle dates are Bangkok calendar arithmetic on `YYYY-MM-DD` strings
 *      (via src/lib/dates.js), never on Date getters. A statement day of 31
 *      is CLAMPED to the last day of a short month — the bank bills on the
 *      30th in April, it does not skip April.
 */
import { todayStr, ymdParts } from './dates.js';

/** ธปท. ceiling for credit-card interest — the app's default estimate rate. */
export const DEFAULT_INTEREST_RATE = 0.16;

/** Credit-bureau health line: keep utilisation under 30% at statement time. */
export const HEALTHY_UTILIZATION = 30;

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Days in a Gregorian month, computed in UTC so no device TZ can shift it. */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Utilisation as a PERCENT (0–…), or `null` when there is no limit to divide
 * by. Null is the honest answer: a card with no limit typed in is not "0%
 * used", and the bar must not draw a reassuring empty track for it.
 */
export function utilizationPct(balance, limit) {
  const lim = Number(limit);
  if (!Number.isFinite(lim) || lim <= 0) return null;
  const bal = Math.max(0, num(balance));
  return (bal / lim) * 100;
}

/**
 * The balance the card grid should display for one card.
 * Linked card → the debt's remaining balance. Unlinked → manual_balance.
 */
export function cardBalance(card, debts = []) {
  if (!card) return 0;
  if (card.debt_id) {
    const debt = (debts || []).find(d => d && d.id === card.debt_id);
    if (debt) return Math.max(0, num(debt.remaining_balance));
  }
  return Math.max(0, num(card.manual_balance));
}

/**
 * Annual-fee waiver progress.
 *
 *   mode 'none'   → nothing to chase; `met` is true and the UI says
 *                   "ฟรี ไม่มีเงื่อนไข ✓".
 *   mode 'count'  → progress/target are SWIPES (KBank: 12 ครั้ง/ปีบัตร).
 *   mode 'amount' → progress/target are BAHT  (CardX: 100,000฿/ปีบัตร).
 *
 * A count/amount card with no target typed in yet is NOT met — the condition
 * exists, it just is not measurable, and quietly calling it "safe" is the one
 * failure mode that costs the owner real money.
 *
 * @returns {{mode: string, progress: number, target: number, remaining: number, met: boolean, pct: number|null}}
 */
export function waiverStatus(card) {
  const mode = card?.waiver_mode || 'none';
  if (mode !== 'count' && mode !== 'amount') {
    return { mode: 'none', progress: 0, target: 0, remaining: 0, met: true, pct: null };
  }
  const progress = Math.max(0, num(card?.waiver_progress));
  const target   = Math.max(0, num(card?.waiver_target));
  if (target <= 0) {
    return { mode, progress, target: 0, remaining: 0, met: false, pct: null };
  }
  return {
    mode, progress, target,
    remaining: Math.max(0, target - progress),
    met: progress >= target,
    pct: Math.min(100, (progress / target) * 100),
  };
}

/**
 * The next occurrence of a day-of-month, on or after `today`, clamped to the
 * length of whichever month it lands in.
 *   day 31, today 2026-04-10 → 2026-04-30 (clamped, not skipped)
 *   day 5,  today 2026-08-16 → 2026-09-05 (already passed this month)
 * Returns `YYYY-MM-DD`, or null when the day is not a usable 1–31.
 */
export function nextDayOfMonth(day, today) {
  const d = Number(day);
  if (!Number.isInteger(d) || d < 1 || d > 31) return null;
  const [y, m, todayDay] = ymdParts(today || todayStr());
  if (!y || !m || !todayDay) return null;

  const at = (yy, mm) => {
    const dd = Math.min(d, daysInMonth(yy, mm));
    return { dd, ymd: `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` };
  };

  const thisMonth = at(y, m);
  if (thisMonth.dd >= todayDay) return thisMonth.ymd;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return at(ny, nm).ymd;
}

/**
 * The card's next two dates. Statement and due are resolved INDEPENDENTLY —
 * each is simply its own next occurrence — because that is what the owner
 * needs to see: on 16 Aug a card that bills on the 20th and is due on the 5th
 * shows "สรุป 20 ส.ค. · ครบกำหนด 5 ก.ย.", and on 3 Aug the same card shows
 * the 5 Aug due date belonging to July's statement, which is the one that can
 * still be missed.
 *
 * @returns {{statement: string|null, due: string|null}} Bangkok `YYYY-MM-DD`.
 */
export function nextCycleDates(statementDay, dueDay, today) {
  const base = today || todayStr();
  return {
    statement: nextDayOfMonth(statementDay, base),
    due:       nextDayOfMonth(dueDay, base),
  };
}

/**
 * What one month of revolving costs, at the ธปท. ceiling unless told otherwise.
 * Deliberately the simple `balance × rate ÷ 12` — it is an ESTIMATE shown as
 * "~฿676", and pretending to do average-daily-balance with data the app does
 * not have would be false precision.
 */
export function monthlyInterestEstimate(balance, rate = DEFAULT_INTEREST_RATE) {
  const bal = num(balance);
  const r   = Number(rate);
  if (bal <= 0 || !Number.isFinite(r) || r <= 0) return 0;
  return (bal * r) / 12;
}

/** `'2026-08-25'` → `'25 ส.ค. 69'`. Already a Bangkok date string. */
export function cycleDateLabel(ymd) {
  const [y, m, d] = ymdParts(ymd);
  if (!y || !m || !d) return '—';
  return `${d} ${THAI_MONTHS_SHORT[m - 1] || ''} ${String(y + 543).slice(-2)}`;
}

/** `'25 ส.ค.'` — the short form used inside the fact boxes. */
export function cycleDayLabel(ymd) {
  const [y, m, d] = ymdParts(ymd);
  if (!y || !m || !d) return '—';
  return `${d} ${THAI_MONTHS_SHORT[m - 1] || ''}`;
}

/** ฿12,345 — whole baht, always with separators. */
export function baht(n) {
  const v = Math.round(num(n));
  return (v < 0 ? '-฿' : '฿') + Math.abs(v).toLocaleString('en-US');
}

export const isActive    = (card) => (card?.status || 'active') !== 'cancelled';
export const isCancelled = (card) => (card?.status || 'active') === 'cancelled';

/**
 * Cards in display order: active first (by sort_order, then name), cancelled
 * last — the grid renders the tail muted rather than hiding it, because a
 * cancelled card is still part of the credit history the owner reasons about.
 */
export function sortCards(cards = []) {
  return (cards || []).slice().sort((a, b) =>
    (isCancelled(a) ? 1 : 0) - (isCancelled(b) ? 1 : 0)
    || num(a.sort_order) - num(b.sort_order)
    || String(a.name || '').localeCompare(String(b.name || ''), 'th')
  );
}

/**
 * Everything the four stat cards at the top of the tab need, in one pass.
 * Cancelled cards are excluded from every figure — they have no limit left to
 * use, no fee to dodge and no statement to miss.
 *
 * @returns {{
 *   limit: number, balance: number, utilization: number|null,
 *   revolvingBalance: number, revolvingCount: number, monthlyInterest: number,
 *   watchCards: object[], annualFeeAtRisk: number,
 *   nextStatement: {card: object, date: string}|null,
 *   nextDue: {card: object, date: string}|null,
 *   activeCount: number,
 * }}
 */
export function summarizeCards({ cards = [], debts = [], today, rate = DEFAULT_INTEREST_RATE } = {}) {
  const base   = today || todayStr();
  const active = (cards || []).filter(isActive);

  let limit = 0, balance = 0, revolvingBalance = 0, revolvingCount = 0;
  const watchCards = [];
  let nextStatement = null, nextDue = null;

  for (const card of active) {
    const bal = cardBalance(card, debts);
    const lim = Number(card.credit_limit);
    // Utilisation is a ratio of what is MEASURABLE: a card with no limit
    // typed in contributes neither its balance nor a phantom limit.
    if (Number.isFinite(lim) && lim > 0) { limit += lim; balance += bal; }

    if (card.pays_full === false) { revolvingBalance += bal; revolvingCount += 1; }

    const waiver = waiverStatus(card);
    if (waiver.mode !== 'none' && !waiver.met) watchCards.push(card);

    const { statement, due } = nextCycleDates(card.statement_day, card.due_day, base);
    if (statement && (!nextStatement || statement < nextStatement.date)) nextStatement = { card, date: statement };
    if (due && (!nextDue || due < nextDue.date)) nextDue = { card, date: due };
  }

  const annualFeeAtRisk = watchCards.reduce((s, c) => s + num(c.annual_fee), 0);

  return {
    limit, balance,
    utilization: utilizationPct(balance, limit),
    revolvingBalance, revolvingCount,
    monthlyInterest: monthlyInterestEstimate(revolvingBalance, rate),
    watchCards, annualFeeAtRisk,
    nextStatement, nextDue,
    activeCount: active.length,
  };
}

/** The fee-profile accordion, in a fixed order, skipping keys left blank. */
export const FEE_PROFILE_FIELDS = [
  { key: 'annual_fee_display', label: 'ค่าธรรมเนียมรายปี' },
  { key: 'interest',           label: 'ดอกเบี้ย (เพดาน ธปท.)' },
  { key: 'cash_advance',       label: 'กดเงินสด' },
  { key: 'fx',                 label: 'ความเสี่ยงอัตราแลกเปลี่ยน (FX)' },
  { key: 'benefits',           label: 'สิทธิประโยชน์' },
];

export function feeProfileRows(card) {
  const fp = card?.fee_profile || {};
  return FEE_PROFILE_FIELDS
    .map(f => ({ ...f, value: typeof fp[f.key] === 'string' ? fp[f.key].trim() : '' }))
    .filter(f => f.value);
}

/** The instalment rows a card is carrying, normalised for display. */
export function installmentRows(card) {
  const list = Array.isArray(card?.installments) ? card.installments : [];
  return list.filter(Boolean).map((row, i) => ({
    key: row.id || `inst-${i}`,
    label: String(row.label || 'ผ่อน 0%'),
    principal: num(row.principal),
    perMonth: num(row.per_month),
    paid: Math.max(0, num(row.paid)),
    total: Math.max(0, num(row.total)),
  }));
}

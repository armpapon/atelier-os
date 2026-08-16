/**
 * Loop — เงินรั่ว · Insights (pure maths for the Money Leaks card)
 *
 * Two jobs, both of which used to live inline in the component:
 *
 *  1. Every insight CARRIES the transactions that produced its number.
 *     The card used to keep only aggregates, so a drill-down would have had
 *     to re-derive the rows and could silently disagree with the figure on
 *     the row. Here the group and its `txns` are built in one pass —
 *     `sumExpense(group.txns) === group.amount` by construction.
 *
 *  2. Two rows can never render as the same text. The card grouped on the
 *     raw `transaction.category` and then resolved a DISPLAY label through
 *     the category list, falling back to the first category sharing the
 *     row's `type`. Imported rows carry categories that are not in the
 *     picker at all ('กาแฟ', 'สุขภาพ', 'บันเทิง' — see autoCategorize in
 *     api/finance.js and lib/kbankPdfParser.js) but DO carry type 'food' /
 *     'other', so 'กาแฟ' rendered as 'อาหาร' and the card showed
 *     "อาหาร — เล็กแต่ถี่" twice. Grouping now merges on a normalised key
 *     and the display text IS that normalised category, so distinct groups
 *     always read differently and identical ones are a single row.
 */
import {
  summarize, detectRecurringFromTransactions, calculateDebtMath, isTransfer,
  bangkokDate, bangkokMonth, previousMonth, currentYearMonth,
} from './api/finance.js';

export const OTHER_CATEGORY = 'อื่น ๆ';

/** Categories that grew by at least this much vs last month are "creep". */
export const CREEP_MIN_DELTA = 300;
/** A category with this many transactions in the month is "เล็กแต่ถี่". */
export const FREQUENT_MIN_COUNT = 6;
export const MAX_CREEP_ROWS = 3;
export const MAX_FREQUENT_ROWS = 2;
export const MAX_RECURRING_ROWS = 4;
export const MAX_TOP_CATEGORIES = 5;

/**
 * Display form of a raw `transaction.category`: trimmed, inner runs of
 * whitespace collapsed. Empty/missing becomes 'อื่น ๆ'.
 */
export function normalizeCategory(raw) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  return s || OTHER_CATEGORY;
}

/**
 * Merge key for a category. Anything that would render as the same visible
 * text — 'อาหาร' vs 'อาหาร ' vs 'Grab' vs 'grab' — collapses to one key, so
 * the card cannot show two rows a human can't tell apart.
 */
export function categoryKey(raw) {
  return normalizeCategory(raw).toLowerCase();
}

/** Newest first, ties broken by id so the order is stable across renders. */
export function sortNewestFirst(txns = []) {
  return [...txns].sort((a, b) => {
    const d = String(b?.occurred_at || '').localeCompare(String(a?.occurred_at || ''));
    if (d !== 0) return d;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  });
}

/** Total spend of a list of expense rows (absolute baht). */
export function sumExpense(txns = []) {
  return txns.reduce((s, t) => s + Math.abs(Number(t?.amount) || 0), 0);
}

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/**
 * '13 ส.ค. 69' — Bangkok calendar day, Buddhist year, 2 digits.
 * Derived from bangkokDate so the label never shifts with the device TZ.
 */
export function leakDateLabel(iso) {
  const ymd = bangkokDate(iso);
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  const month = THAI_MONTHS_SHORT[m - 1] || '';
  return `${d} ${month} ${String(y + 543).slice(-2)}`;
}

/**
 * Group expenses by category, keeping the rows behind every total.
 * Same filtering rules as aggregateByCategory (no transfers, expenses only)
 * — only the grouping key and the attached `txns` differ.
 */
export function groupExpensesByCategory(txns = []) {
  const m = new Map();
  for (const t of txns) {
    if (isTransfer(t)) continue;
    const amt = Number(t?.amount);
    if (!(amt < 0)) continue;
    const key = categoryKey(t?.category);
    let g = m.get(key);
    if (!g) {
      g = { key, category: normalizeCategory(t?.category), type: t?.type || null, amount: 0, count: 0, txns: [] };
      m.set(key, g);
    }
    g.amount += Math.abs(amt);
    g.count += 1;
    g.txns.push(t);
  }
  return [...m.values()]
    .map(g => ({ ...g, txns: sortNewestFirst(g.txns) }))
    .sort((a, b) => (b.amount - a.amount) || a.key.localeCompare(b.key));
}

/** 'YYYY-MM' or nothing → the month the card is looking at. */
function resolveYearMonth(yearMonth) {
  const s = String(yearMonth ?? '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : currentYearMonth();
}

/**
 * Is a detected subscription STILL being charged, seen from `yearMonth`?
 *
 * The detector reads a 12-month window because two months of charges is the
 * minimum evidence that something is a bill at all. That window is history,
 * not the present: a finished 2-installment tax payment (กรมสรรพากร, 8 พ.ค.
 * + 8 มิ.ย. 69) kept renderering under a card labelled "เดือนนี้" all the way
 * into ส.ค., and its ฿9,608 kept inflating the monthly total.
 *
 * Alive = last charged in the viewed month, or in the one right before it.
 * The month of grace is not slack — a monthly bill that has not been charged
 * yet this month is still a bill, and dropping it would be the opposite lie.
 *
 * Recency is measured against the VIEWED month, never against today, so
 * browsing back to มิ.ย. shows what was alive in มิ.ย. The history window the
 * page hands in ends at the viewed month (Finance.jsx `history12`), so
 * `lastDate` never runs ahead of it.
 */
export function isRecurringAlive(item, yearMonth) {
  const ym = resolveYearMonth(yearMonth);
  const last = bangkokMonth(item?.lastDate);
  if (!last) return false;
  return last === ym || last === previousMonth(ym);
}

/**
 * Everything the Money Leaks card renders, with drill-down rows attached.
 *
 *   creep[]     — { key, category, amount, count, txns, delta }
 *   frequent[]  — { key, category, amount, count, txns, avg }
 *   recurring[] — { title, avgAmount, monthsCount, txns, … }
 *   debtRows[]  — { debt, remainingInterest, rate } sorted worst-first
 *
 * `yearMonth` ('YYYY-MM') is the month the card is showing — the Finance
 * page's selected month, which is NOT necessarily the calendar month. It
 * decides which subscriptions still count as live; empty/unreadable falls
 * back to the current Bangkok month.
 */
export function buildLeakInsights({ txns = [], prevTxns = [], trend12 = [], debts = [], yearMonth } = {}) {
  const ym = resolveYearMonth(yearMonth);
  const thisSum = summarize(txns);
  const prevSum = summarize(prevTxns);
  const srDelta = thisSum.savingsRate - prevSum.savingsRate;

  const thisCat = groupExpensesByCategory(txns);
  const prevMap = new Map();
  for (const g of groupExpensesByCategory(prevTxns)) prevMap.set(g.key, g.amount);

  // 1) Lifestyle creep — categories that grew vs last month
  const creep = thisCat
    .map(g => ({ ...g, delta: g.amount - (prevMap.get(g.key) || 0) }))
    .filter(g => g.delta >= CREEP_MIN_DELTA && prevSum.expense > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, MAX_CREEP_ROWS);

  // 2) Small-but-frequent — many transactions in one category
  const frequent = thisCat
    .filter(g => g.count >= FREQUENT_MIN_COUNT)
    .map(g => ({ ...g, avg: g.amount / g.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_FREQUENT_ROWS);

  // 3) Subscriptions / recurring charges detected across the 12-month window,
  //    then narrowed to the ones still being charged as of `ym` — see
  //    isRecurringAlive. Filtering BEFORE the slice matters: a dead bill must
  //    not eat one of the four visible slots. The receipts underneath a
  //    surviving row keep every charge, past months included — those dates
  //    are the evidence for the number, not a claim about this month.
  const recurring = detectRecurringFromTransactions(trend12)
    .filter(r => isRecurringAlive(r, ym))
    .slice(0, MAX_RECURRING_ROWS)
    .map(r => ({ ...r, txns: sortNewestFirst(r.txns || []) }));
  const recurringTotal = recurring.reduce((s, r) => s + r.avgAmount, 0);

  // 4) Debt interest leak
  const activeDebts = (debts || []).filter(d => d.is_active !== false);
  let remainingInterest = 0;
  let worst = null; // highest interest rate
  const debtRows = [];
  for (const d of activeDebts) {
    const math = calculateDebtMath(d);
    const owed = math.remainingInterest || 0;
    remainingInterest += owed;
    const rate = Number(d.interest_rate || 0);
    debtRows.push({ debt: d, remainingInterest: owed, rate });
    if (rate > 0 && (!worst || rate > Number(worst.interest_rate || 0))) worst = d;
  }
  debtRows.sort((a, b) => b.remainingInterest - a.remainingInterest);

  const topCats = thisCat.slice(0, MAX_TOP_CATEGORIES);

  return {
    thisSum, prevSum, srDelta,
    creep, frequent, recurring, recurringTotal,
    remainingInterest, worst, debtRows, topCats,
  };
}

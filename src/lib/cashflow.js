/**
 * Loop — pure maths for the 12-month cash-flow chart.
 *
 * Every decision the chart makes — which months it shows, which one the strip
 * reads out, how tall a bar is, what the ▲▼ delta says — lives here so it can
 * be asserted in audit/cases.mjs without a DOM.
 *
 * The rule this module exists to enforce:
 *
 *   THE WINDOW IS ANCHORED TO THE CURRENT MONTH.
 *
 * The old chart built its window with lastNMonths(12, yearMonth) — the SELECTED
 * month — so clicking a bar rebuilt the window to end on the month you clicked
 * and every later month slid off the right edge. Selecting a month must move
 * the highlight and the strip, never the window.
 */
import { currentYearMonth, lastNMonths, bangkokMonth } from './api/finance.js';

export const CHART_MONTHS = 12;

/**
 * The chart's month window: N months ending at TODAY's month (Bangkok).
 * Takes `todayYm` only so tests can pin it — never the selected month.
 */
export function cashflowWindow(todayYm = currentYearMonth(), n = CHART_MONTHS) {
  return lastNMonths(n, todayYm);
}

/** Savings rate as a percentage. Zero income yields 0, never NaN/Infinity. */
export function savingsRate(income, expense) {
  const i = Number(income) || 0;
  const e = Number(expense) || 0;
  if (!(i > 0)) return 0;
  return ((i - e) / i) * 100;
}

/**
 * Percentage change of `cur` against `prev`.
 * Returns null — not Infinity, not a bogus 100% — when there is no usable
 * baseline (no previous month, or a previous month of exactly zero). The strip
 * renders nothing in that case rather than claiming a change it cannot know.
 */
export function pctDelta(cur, prev) {
  if (prev == null) return null;
  const p = Number(prev) || 0;
  if (!(p > 0)) return null;
  return ((Number(cur) || 0) - p) / p * 100;
}

/**
 * Project a month-aggregate list onto the fixed window, filling gaps with
 * zeros and dropping anything outside it. Always returns exactly `n` rows in
 * chronological order.
 */
export function cashflowSeries(agg, todayYm = currentYearMonth(), n = CHART_MONTHS) {
  const byYm = new Map((agg || []).map(a => [a.ym, a]));
  return cashflowWindow(todayYm, n).map(ym => {
    const a = byYm.get(ym);
    const income  = Number(a?.income)  || 0;
    const expense = Number(a?.expense) || 0;
    return {
      ym, income, expense,
      net: income - expense,
      savingsRate: savingsRate(income, expense),
      count: Number(a?.count) || 0,
    };
  });
}

/**
 * Index of the month the chart highlights and the strip reads out.
 * A selection outside the window (the page month can be steered anywhere by
 * MonthNav) falls back to the current month — the last slot — so the strip and
 * the highlight never disagree.
 */
export function resolveSelection(series, ym) {
  if (!series?.length) return -1;
  const i = series.findIndex(d => d.ym === ym);
  return i >= 0 ? i : series.length - 1;
}

/** Everything the summary strip prints for one month of the series. */
export function monthReadout(series, ym) {
  const i = resolveSelection(series, ym);
  if (i < 0) return null;
  const d = series[i];
  const prev = i > 0 ? series[i - 1] : null;
  return {
    index: i,
    ym: d.ym,
    income: d.income,
    expense: d.expense,
    net: d.income - d.expense,
    savingsRate: savingsRate(d.income, d.expense),
    expenseDelta: pctDelta(d.expense, prev ? prev.expense : null),
    incomeDelta:  pctDelta(d.income,  prev ? prev.income  : null),
    hasPrev: i > 0,
    hasNext: i < series.length - 1,
    // The window always ends at the current month, so the last slot IS today.
    isCurrent: i === series.length - 1,
  };
}

/** Keep only the transactions whose Bangkok month is in `months`. */
export function filterToMonths(txns, months) {
  const keep = new Set(months || []);
  return (txns || []).filter(t => keep.has(bangkokMonth(t.occurred_at)));
}

/** Axis-label money: 87K / 1.2M / 940. No decimals in the thousands band. */
export function compactBaht(v) {
  const n = Math.abs(Math.round(Number(v) || 0));
  const sign = (Number(v) || 0) < 0 ? '-' : '';
  if (n >= 1_000_000) return sign + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000)      return sign + Math.round(n / 1000) + 'K';
  return sign + String(n);
}

export const CHART_LAYOUT = {
  W: 720, H: 232,
  padL: 44, padR: 10, padT: 14, padB: 32,
  maxBarW: 16,
  pairGap: 2,      // gap between the income and expense bar of one month
  barRadius: 4,    // rounded data end, flat on the baseline
  gridlines: 3,    // recessive hairlines, plus the baseline
};

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Bar/grid geometry for the series. Pure — no DOM, no React — so the harness
 * can assert bar heights, the in-pair gap and the empty-data case directly.
 */
export function chartGeometry(series, layout = {}) {
  const L = { ...CHART_LAYOUT, ...layout };
  const rows = series || [];
  const innerW = L.W - L.padL - L.padR;
  const innerH = L.H - L.padT - L.padB;
  const baseY  = L.padT + innerH;
  const n = Math.max(1, rows.length);
  // Max of 1 keeps every division defined when the whole window is empty.
  const max = Math.max(1, ...rows.flatMap(d => [Number(d.income) || 0, Number(d.expense) || 0]));
  const groupW = innerW / n;
  const barW = r2(Math.max(4, Math.min(L.maxBarW, (groupW - 14) / 2)));

  // A zero month draws nothing — a 3px stub would read as "a little money".
  const hOf = (v) => {
    const x = Number(v) || 0;
    return x > 0 ? r2(Math.max(3, (x / max) * innerH)) : 0;
  };

  const grid = Array.from({ length: L.gridlines }, (_, i) => {
    const v = (max * (i + 1)) / L.gridlines;
    return { v, y: r2(baseY - (v / max) * innerH), label: compactBaht(v) };
  });

  const bars = rows.map((d, i) => {
    const x  = r2(L.padL + i * groupW);
    const cx = r2(L.padL + i * groupW + groupW / 2);
    const ih = hOf(d.income);
    const eh = hOf(d.expense);
    return {
      ym: d.ym, index: i, x, cx, groupW: r2(groupW),
      income:  { x: r2(cx - barW - L.pairGap / 2), y: r2(baseY - ih), w: barW, h: ih },
      expense: { x: r2(cx + L.pairGap / 2),        y: r2(baseY - eh), w: barW, h: eh },
    };
  });

  return {
    ...L, innerW: r2(innerW), innerH: r2(innerH), baseY: r2(baseY),
    max, groupW: r2(groupW), barW, grid, bars,
    labelY: L.H - 10, dotY: L.H - 3,
  };
}

/**
 * A bar with a rounded data end and a flat foot on the baseline.
 * Returns '' for a zero-height bar so an empty month renders no mark at all.
 */
export function barPath(x, y, w, h, radius = CHART_LAYOUT.barRadius) {
  if (!(h > 0) || !(w > 0)) return '';
  const r = Math.max(0, Math.min(radius, w / 2, h));
  const [X, Y, W, R] = [r2(x), r2(y), r2(w), r2(r)];
  const B = r2(y + h);
  return `M ${X} ${B} L ${X} ${r2(Y + R)} Q ${X} ${Y} ${r2(X + R)} ${Y} `
       + `L ${r2(X + W - R)} ${Y} Q ${r2(X + W)} ${Y} ${r2(X + W)} ${r2(Y + R)} `
       + `L ${r2(X + W)} ${B} Z`;
}

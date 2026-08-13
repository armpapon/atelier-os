// Mounted acceptance for the cash-flow chart rebuild (v4.33).
//
// Two things are proven here that a pure test cannot:
//   1. Clicking a bar on the REAL Finance page moves the highlight and the
//      strip, and leaves the set of months on the chart untouched. That is the
//      bug the owner reported — "พอกดแล้วเดือนก็หายไป".
//   2. The strip is in the DOM without any hover, so the numbers exist on a
//      touch device, and the "↩ เดือนนี้" chip shows up only off-current.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import React, { useState } from 'react';

import { FinanceView } from '../../src/pages/Finance.jsx';
import { CashFlowChart } from '../../src/components/dashboard/CashFlowChart.jsx';
import { cashflowWindow } from '../../src/lib/cashflow.js';
import { currentYearMonth, getMonthBounds } from '../../src/lib/api/finance.js';
import { __tables, __config } from '../mock-supabase.mjs';

const monthsOn = (root) =>
  Array.from(root.querySelectorAll('[data-month]')).map(g => g.getAttribute('data-month'));

const selectedOn = (root) =>
  root.querySelector('[data-month][data-selected="true"]')?.getAttribute('data-month') ?? null;

const stripText = () => screen.getByTestId('cashflow-strip').textContent;

beforeEach(() => {
  cleanup();
  for (const k of Object.keys(__tables)) __tables[k] = [];
  __config.rpcHandlers = {};
  __config.missingColumns = {};
  __config.opFailures = {};
  __config.opFailurePredicate = null;
  vi.stubGlobal('matchMedia', (query) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }));
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
});

// ── A fixed series, so the strip maths is asserted on known numbers ─────────
function fixedSeries(todayYm) {
  return cashflowWindow(todayYm).map((ym, i) => {
    const income  = 100000 + i * 1000;
    const expense = 80000 + i * 4000;
    return { ym, income, expense, net: income - expense, savingsRate: ((income - expense) / income) * 100, count: 1 };
  });
}

/** Controlled host — the page owns the selection, exactly as Finance.jsx does. */
function Host({ data, todayYm, onPick }) {
  const [sel, setSel] = useState(todayYm);
  return (
    <CashFlowChart
      data={data}
      selectedYm={sel}
      currentYm={todayYm}
      onMonthClick={(ym) => { setSel(ym); onPick?.(ym); }}
    />
  );
}

describe('CashFlowChart · แถบสรุปเดือนที่เลือก (v4.33)', () => {

  it('shows the selected month figures with no hover at all', () => {
    const today = '2026-08';
    const data = fixedSeries(today);
    const { container } = render(<Host data={data} todayYm={today} />);

    // Twelve months on the plot, ending at the current month.
    expect(monthsOn(container)).toHaveLength(12);
    expect(monthsOn(container).at(-1)).toBe(today);

    // The numbers are present in the DOM, not behind a pointer event.
    const strip = stripText();
    expect(strip).toContain('ส.ค. 2569');
    expect(strip).toContain('รายรับ');
    expect(strip).toContain('฿111,000');   // income of the last slot
    expect(strip).toContain('฿124,000');   // expense of the last slot
    expect(strip).toContain('ออม');
  });

  it('clicking a bar moves the strip and the highlight — and nothing else', () => {
    const today = '2026-08';
    const data = fixedSeries(today);
    const { container } = render(<Host data={data} todayYm={today} />);

    const monthsBefore = monthsOn(container);
    expect(selectedOn(container)).toBe(today);

    fireEvent.click(container.querySelector('[data-month="2026-03"]'));

    // The strip followed the click…
    expect(stripText()).toContain('มี.ค. 2569');
    expect(selectedOn(container)).toBe('2026-03');
    // …and the window did not.
    expect(monthsOn(container)).toEqual(monthsBefore);
  });

  it('prints a ▲▼ delta against the previous month, and none for the first slot', () => {
    const today = '2026-08';
    const data = fixedSeries(today);
    const { container } = render(<Host data={data} todayYm={today} />);

    // expense 80,000 → 84,000 across the first step = ▲ 5%
    fireEvent.click(container.querySelector('[data-month="2025-10"]'));
    expect(stripText()).toMatch(/▲\s*5%/);

    // Oldest slot has no previous month in the window — no percentage claimed.
    fireEvent.click(container.querySelector('[data-month="2025-09"]'));
    expect(stripText()).not.toMatch(/[▲▼]/);
  });

  it('a month with no income reads 0% saving, never NaN', () => {
    const today = '2026-08';
    const data = cashflowWindow(today).map((ym, i) => ({
      ym, income: 0, expense: i === 11 ? 12000 : 0, net: i === 11 ? -12000 : 0, savingsRate: 0, count: 0,
    }));
    render(<Host data={data} todayYm={today} />);
    const strip = stripText();
    expect(strip).toContain('0%');
    expect(strip).not.toContain('NaN');
    expect(strip).toContain('−฿12,000');
  });

  it('the "↩ เดือนนี้" chip appears only off-current and returns you home', () => {
    const today = '2026-08';
    const data = fixedSeries(today);
    const { container } = render(<Host data={data} todayYm={today} />);

    expect(screen.queryByText('↩ เดือนนี้')).toBeNull();

    fireEvent.click(container.querySelector('[data-month="2026-01"]'));
    const chip = screen.getByText('↩ เดือนนี้');
    expect(chip).toBeTruthy();

    fireEvent.click(chip);
    expect(selectedOn(container)).toBe(today);
    expect(screen.queryByText('↩ เดือนนี้')).toBeNull();
  });

  it('the ‹ › steppers walk the window and stop at both ends', () => {
    const today = '2026-08';
    const data = fixedSeries(today);
    const { container } = render(<Host data={data} todayYm={today} />);
    const strip = () => screen.getByTestId('cashflow-strip');

    // On the current month, "next" is spent.
    expect(within(strip()).getByLabelText('เดือนถัดไป').disabled).toBe(true);
    fireEvent.click(within(strip()).getByLabelText('เดือนก่อน'));
    expect(selectedOn(container)).toBe('2026-07');
    expect(within(strip()).getByLabelText('เดือนถัดไป').disabled).toBe(false);
  });

  it('the savings-rate line is gone from the plot — one scale on the y-axis', () => {
    const today = '2026-08';
    const { container } = render(<Host data={fixedSeries(today)} todayYm={today} />);
    // The old chart drew the rate as a dashed <path> + a <circle> per month on
    // the baht axis. Only the current-month tick circle may remain.
    expect(container.querySelectorAll('svg path[stroke-dasharray]')).toHaveLength(0);
    expect(container.querySelectorAll('svg circle')).toHaveLength(1);
  });
});

// ── The real page ───────────────────────────────────────────────────────────
describe('Finance page · the 12-month window is anchored to today (v4.33)', () => {

  /** Salary + rent in each of the last N months, so every bar has data. */
  function seedMonths(n = 13) {
    const today = currentYearMonth();
    const yms = cashflowWindow(today, n);
    yms.forEach((ym, i) => {
      const { start } = getMonthBounds(ym);
      const day = `${start.slice(0, 8)}05T03:00:00+00:00`;
      __tables.transactions.push(
        { id: `inc-${ym}`, user_id: 'user-1', scope: 'personal', title: 'เงินเดือน',
          amount: 100000 + i * 1000, category: 'รายรับ', type: 'income', occurred_at: day },
        { id: `exp-${ym}`, user_id: 'user-1', scope: 'personal', title: 'ค่าเช่า',
          amount: -(40000 + i * 500), category: 'บ้าน', type: 'home', occurred_at: day },
      );
    });
    return yms;
  }

  it('clicking an older bar does NOT slide the window — the same 12 months stay on screen', async () => {
    seedMonths(13);
    const today = currentYearMonth();
    const { container } = render(<FinanceView scope="personal" />);

    await waitFor(() => expect(monthsOn(container)).toHaveLength(12));
    const monthsBefore = monthsOn(container);
    expect(monthsBefore.at(-1)).toBe(today);
    expect(selectedOn(container)).toBe(today);

    // Pick the fourth-oldest month on the chart.
    const target = monthsBefore[3];
    fireEvent.click(container.querySelector(`[data-month="${target}"]`));

    // The page reloads around the clicked month…
    await waitFor(() => expect(selectedOn(container)).toBe(target));
    // …and the chart is still showing exactly the same twelve months, still
    // ending at today. Before this fix the window re-anchored on the click and
    // every month after `target` disappeared.
    expect(monthsOn(container)).toEqual(monthsBefore);
    expect(monthsOn(container).at(-1)).toBe(today);
    expect(screen.getByTestId('cashflow-strip').textContent).toContain('↩ เดือนนี้');
  });

  it('the chart keeps the current month while the strip steppers walk the page month back', async () => {
    seedMonths(13);
    const today = currentYearMonth();
    const { container } = render(<FinanceView scope="personal" />);

    await waitFor(() => expect(monthsOn(container)).toHaveLength(12));
    const monthsBefore = monthsOn(container);

    // Step the page month back twice with the chart's own stepper.
    const strip = () => screen.getByTestId('cashflow-strip');
    fireEvent.click(within(strip()).getByLabelText('เดือนก่อน'));
    await waitFor(() => expect(selectedOn(container)).toBe(monthsBefore[10]));
    fireEvent.click(within(strip()).getByLabelText('เดือนก่อน'));
    await waitFor(() => expect(selectedOn(container)).toBe(monthsBefore[9]));

    expect(monthsOn(container)).toEqual(monthsBefore);
    expect(monthsOn(container).at(-1)).toBe(today);
  });
});

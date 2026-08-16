// Mounted acceptance for the เงินรั่ว · Insights drill-down (v4.34).
//
// Proven here and nowhere else:
//   1. Two categories that share a `type` render as two rows a human can tell
//      apart. The owner's screenshot showed "อาหาร — เล็กแต่ถี่" twice because
//      'กาแฟ' (written by the importers, absent from the picker) was relabelled
//      through the type fallback.
//   2. A row opens from the keyboard alone, and the panel under it sums to the
//      exact figure printed on the row.
//   3. Opening and closing a row changes nothing about the card's numbers.
//   4. The subscriptions row lists all four bills with their own amounts, and
//      each one opens its own charges.
//   5. The debt row is a link to the Debt Tracker, not a transaction list — and
//      the anchor it jumps to really exists on the Finance page.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { MoneyLeaks } from '../../src/components/dashboard/MoneyLeaks.jsx';
import { FinanceView, DEBT_TRACKER_ANCHOR } from '../../src/pages/Finance.jsx';
import { formatBaht } from '../../src/components/dashboard/KPICard.jsx';
import { sumExpense } from '../../src/lib/moneyLeaks.js';
import { currentYearMonth, getMonthBounds } from '../../src/lib/api/finance.js';
import { cashflowWindow } from '../../src/lib/cashflow.js';
import { __tables, __config } from '../mock-supabase.mjs';

const CATEGORIES = [
  { id: 'food',      label: 'อาหาร',    icon: '🍜', type: 'food' },
  { id: 'transport', label: 'เดินทาง',  icon: '🚗', type: 'transport' },
  { id: 'bills',     label: 'บิล',      icon: '💡', type: 'bills' },
  { id: 'shop',      label: 'ช้อปปิ้ง', icon: '🛍', type: 'shop' },
  { id: 'other',     label: 'อื่น ๆ',   icon: '📦', type: 'other' },
];

const ACCOUNTS = [{ id: 'acc-1', name: 'KBank' }, { id: 'acc-2', name: 'SCB' }];

const row    = (c, id) => c.querySelector(`[data-leak-row="${id}"]`);
const panel  = (c, id) => c.querySelector(`[data-leak-detail="${id}"]`);
const rowIds = (c) => Array.from(c.querySelectorAll('[data-leak-row]')).map(e => e.getAttribute('data-leak-row'));
const cardNumbers = (c) => Array.from(c.querySelectorAll('[data-leak-row]'))
  .map(e => e.textContent.replace(/\s+/g, ' ').trim());

const exp = (id, day, amount, category, type, account_id) => ({
  id, occurred_at: `2026-08-${String(day).padStart(2, '0')}T05:00:00Z`,
  amount, category, type, account_id, title: `รายการ ${id}`, scope: 'personal',
});

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

// 27 × ฿185 booked to 'อาหาร' and 12 × ฿99 booked to 'กาแฟ' — the owner's
// screenshot. Both carry type 'food'; only 'อาหาร' is in the picker.
const FOOD   = Array.from({ length: 27 }, (_, i) => exp('f' + i, (i % 28) + 1, -185, 'อาหาร', 'food', 'acc-1'));
const COFFEE = Array.from({ length: 12 }, (_, i) => exp('c' + i, (i % 28) + 1, -99, 'กาแฟ', 'food', 'acc-2'));

describe('เงินรั่ว · สองหมวดที่ type เดียวกันต้องแยกออกจากกันได้ (v4.34)', () => {

  it('renders "อาหาร" and "กาแฟ" as two different rows, not "อาหาร" twice', () => {
    const { container } = render(
      <MoneyLeaks txns={[...FOOD, ...COFFEE]} prevTxns={[]} trend12={[]} debts={[]}
        allCategories={CATEGORIES} accounts={ACCOUNTS} />,
    );

    expect(screen.getByText('อาหาร — เล็กแต่ถี่')).toBeTruthy();
    expect(screen.getByText('กาแฟ — เล็กแต่ถี่')).toBeTruthy();
    // getByText throws on a second match, but be explicit about the defect.
    expect(screen.getAllByText('อาหาร — เล็กแต่ถี่')).toHaveLength(1);

    // Nothing on the card reads the same as anything else on it.
    const titles = Array.from(container.querySelectorAll('[data-leak-row]'))
      .map(e => e.querySelector('span > span')?.textContent);
    expect(new Set(titles).size).toBe(titles.length);
    expect(rowIds(container).sort()).toEqual(['freq-กาแฟ', 'freq-อาหาร']);
  });

  it('keeps each row on its own numbers', () => {
    render(
      <MoneyLeaks txns={[...FOOD, ...COFFEE]} prevTxns={[]} trend12={[]} debts={[]}
        allCategories={CATEGORIES} accounts={ACCOUNTS} />,
    );
    expect(screen.getByText('27 ครั้ง · เฉลี่ย ฿185/ครั้ง')).toBeTruthy();
    expect(screen.getByText('12 ครั้ง · เฉลี่ย ฿99/ครั้ง')).toBeTruthy();
  });
});

describe('เงินรั่ว · กดแถวแล้วเห็นรายการที่อยู่เบื้องหลัง (v4.34)', () => {

  it('opens from the keyboard alone — Enter opens, Space closes', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MoneyLeaks txns={[...FOOD, ...COFFEE]} prevTxns={[]} trend12={[]} debts={[]}
        allCategories={CATEGORIES} accounts={ACCOUNTS} />,
    );

    const btn = row(container, 'freq-กาแฟ');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(panel(container, 'freq-กาแฟ')).toBeNull();

    btn.focus();
    expect(document.activeElement).toBe(btn);
    await user.keyboard('{Enter}');

    await waitFor(() => expect(panel(container, 'freq-กาแฟ')).toBeTruthy());
    expect(row(container, 'freq-กาแฟ').getAttribute('aria-expanded')).toBe('true');

    row(container, 'freq-กาแฟ').focus();
    await user.keyboard(' ');
    await waitFor(() => expect(panel(container, 'freq-กาแฟ')).toBeNull());
  });

  it('the drill-down lists the transactions and sums to the figure on the row', () => {
    const { container } = render(
      <MoneyLeaks txns={[...FOOD, ...COFFEE]} prevTxns={[]} trend12={[]} debts={[]}
        allCategories={CATEGORIES} accounts={ACCOUNTS} />,
    );

    fireEvent.click(row(container, 'freq-กาแฟ'));
    const p = panel(container, 'freq-กาแฟ');

    expect(p.textContent).toContain('12 รายการ');
    expect(p.textContent).toContain(`รวม ${formatBaht(sumExpense(COFFEE))}`);
    expect(p.textContent).toContain(formatBaht(1188));
    // …and that is exactly what the row itself claims.
    expect(row(container, 'freq-กาแฟ').textContent).toContain(formatBaht(1188));

    // Date, title, category and account are all present, newest first.
    expect(p.textContent).toContain('รายการ c');
    expect(p.textContent).toContain('กาแฟ · SCB');
    const dates = Array.from(p.querySelectorAll('.leak-detail__scroll > div'))
      .map(d => d.firstChild.textContent);
    expect(dates[0]).toBe('12 ส.ค. 69');
    expect(dates.at(-1)).toBe('1 ส.ค. 69');
  });

  it('only one row is open at a time, and closing restores the card exactly', () => {
    const { container } = render(
      <MoneyLeaks txns={[...FOOD, ...COFFEE]} prevTxns={[]} trend12={[]} debts={[]}
        allCategories={CATEGORIES} accounts={ACCOUNTS} />,
    );

    const before = cardNumbers(container);
    const heroBefore = container.textContent.includes('อัตราการออม');
    expect(heroBefore).toBe(true);

    fireEvent.click(row(container, 'freq-อาหาร'));
    expect(panel(container, 'freq-อาหาร')).toBeTruthy();

    fireEvent.click(row(container, 'freq-กาแฟ'));
    expect(panel(container, 'freq-อาหาร')).toBeNull();
    expect(panel(container, 'freq-กาแฟ')).toBeTruthy();

    fireEvent.click(row(container, 'freq-กาแฟ'));
    expect(container.querySelectorAll('[data-leak-detail]')).toHaveLength(0);
    expect(cardNumbers(container)).toEqual(before);
  });

  it('creep rows carry this month\'s rows for that category only', () => {
    const txns = [
      exp('s1', 20, -5000, 'ช้อปปิ้ง', 'shop', 'acc-1'),
      exp('s2', 21, -1200, 'ช้อปปิ้ง', 'shop', 'acc-1'),
      exp('o1', 22, -80, 'อื่น ๆ', 'other', 'acc-1'),
    ];
    const prev = [{ ...exp('p1', 10, -1000, 'ช้อปปิ้ง', 'shop', 'acc-1'), occurred_at: '2026-07-10T05:00:00Z' }];
    const { container } = render(
      <MoneyLeaks txns={txns} prevTxns={prev} trend12={[]} debts={[]}
        allCategories={CATEGORIES} accounts={ACCOUNTS} />,
    );

    const id = 'creep-ช้อปปิ้ง';
    expect(row(container, id).textContent).toContain('+฿5,200');
    fireEvent.click(row(container, id));
    const p = panel(container, id);
    expect(p.textContent).toContain('2 รายการ');
    expect(p.textContent).toContain('รวม ฿6,200');   // the "เดือนนี้" figure
    expect(p.textContent).not.toContain('รายการ o1');
    expect(p.textContent).not.toContain('รายการ p1');
  });
});

describe('เงินรั่ว · บิล/subscription เปิดดูได้ทีละใบ (v4.34)', () => {
  const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
  const bill = (name, amount) => months.map((ym, i) => ({
    id: `${name}-${i}`, occurred_at: `${ym}-05T05:00:00Z`, amount: -amount,
    category: 'บิล', type: 'bills', title: name, scope: 'personal', account_id: 'acc-1',
  }));
  const trend = [...bill('Netflix', 419), ...bill('Spotify', 199),
    ...bill('iCloud', 99), ...bill('ค่าเน็ต', 799)];

  it('shows all four bills with their own amounts, not just three names', () => {
    const { container } = render(
      <MoneyLeaks txns={[...FOOD]} prevTxns={[]} trend12={trend} debts={[]}
        allCategories={CATEGORIES} accounts={ACCOUNTS} />,
    );

    // Collapsed, the summary still only has room for three names…
    expect(row(container, 'subs').textContent).toContain('บิล/subscription ซ้ำ 4 รายการ');
    expect(row(container, 'subs').textContent).toContain('฿1,516/ด');

    fireEvent.click(row(container, 'subs'));
    const p = panel(container, 'subs');
    for (const [name, amt] of [['ค่าเน็ต', 799], ['Netflix', 419], ['Spotify', 199], ['iCloud', 99]]) {
      expect(p.textContent).toContain(name);
      expect(p.textContent).toContain(`${formatBaht(amt)}/ด`);
    }
    expect(p.querySelectorAll('[data-leak-row]')).toHaveLength(4);
  });

  it('drills from one bill into its own charges across the window', () => {
    const { container } = render(
      <MoneyLeaks txns={[...FOOD]} prevTxns={[]} trend12={trend} debts={[]}
        allCategories={CATEGORIES} accounts={ACCOUNTS} />,
    );

    fireEvent.click(row(container, 'subs'));
    // Sorted by avgAmount: ค่าเน็ต, Netflix, Spotify, iCloud → Netflix is #1.
    fireEvent.click(row(container, 'subs-1'));

    const p = panel(container, 'subs-1');
    expect(p.textContent).toContain('6 รายการ');
    expect(p.textContent).toContain(`รวม ${formatBaht(419 * 6)}`);
    expect(p.textContent).toContain('เฉลี่ย ฿419/ครั้ง');
    expect(p.textContent).toContain('Netflix');
    expect(p.textContent).not.toContain('Spotify');

    // Closing the parent takes the nested panel with it, numbers untouched.
    fireEvent.click(row(container, 'subs'));
    expect(container.querySelectorAll('[data-leak-detail]')).toHaveLength(0);
    expect(row(container, 'subs').textContent).toContain('฿1,516/ด');
  });
});

describe('เงินรั่ว · แถวดอกเบี้ยหนี้ลิงก์ไปตารางหนี้ (v4.34)', () => {
  const debts = [
    { id: 'd1', name: 'บ้าน', monthly_payment: 10000, total_months: 24, months_paid: 0, interest_rate: 4.1, original_principal: 200000, scope: 'personal' },
  ];

  it('is a button that calls the jump handler and never expands a list', () => {
    const onOpenDebts = vi.fn();
    const { container } = render(
      <MoneyLeaks txns={[...FOOD]} prevTxns={[]} trend12={[]} debts={debts}
        allCategories={CATEGORIES} accounts={ACCOUNTS} onOpenDebts={onOpenDebts} />,
    );

    const btn = row(container, 'debt');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('aria-expanded')).toBeNull();
    expect(btn.textContent).toContain('ไปที่ตารางหนี้');

    fireEvent.click(btn);
    expect(onOpenDebts).toHaveBeenCalledTimes(1);
    expect(panel(container, 'debt')).toBeNull();
  });

  it('on the real page the row opens the หนี้ tab and lands on the anchor', async () => {
    // v4.35: the Debt Tracker moved into its own sub-tab, so the jump has to
    // switch rooms first — the anchor does not exist until it does.
    __tables.debts.push({
      id: 'd1', user_id: 'user-1', name: 'บ้าน', type: 'loan', monthly_payment: 10000,
      due_day: 5, total_months: 24, months_paid: 0, interest_rate: 4.1,
      original_principal: 200000, remaining_balance: 200000, scope: 'personal', is_active: true,
    });
    const yms = cashflowWindow(currentYearMonth(), 13);
    yms.forEach((ym, i) => {
      const { start } = getMonthBounds(ym);
      const day = `${start.slice(0, 8)}05T03:00:00+00:00`;
      __tables.transactions.push(
        { id: `inc-${ym}`, user_id: 'user-1', scope: 'personal', title: 'เงินเดือน',
          amount: 100000, category: 'รายรับ', type: 'income', occurred_at: day },
        { id: `exp-${ym}`, user_id: 'user-1', scope: 'personal', title: 'ค่าเช่า',
          amount: -(40000 + i * 500), category: 'บ้าน', type: 'home', occurred_at: day },
      );
    });

    const { container } = render(<FinanceView scope="personal" />);

    // The row is on the default ภาพรวม tab; the anchor is not rendered yet.
    const debtRow = await waitFor(() => {
      const el = container.querySelector('[data-leak-row="debt"]');
      expect(el).toBeTruthy();
      return el;
    });
    expect(container.querySelector(`#${DEBT_TRACKER_ANCHOR}`)).toBeNull();

    fireEvent.click(debtRow);

    await waitFor(() => expect(container.querySelector(`#${DEBT_TRACKER_ANCHOR}`)).toBeTruthy());
    expect(screen.getByRole('tab', { name: 'หนี้' }).getAttribute('aria-selected')).toBe('true');
  });
});

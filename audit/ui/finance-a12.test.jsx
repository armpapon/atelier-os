// Mounted acceptance for the phase-3 Finance surfaces the A12 audit found
// unguarded (v4.61). Every case pins the EXACT resolved value on screen, not
// just the presence of an element — the four defects below all passed a green
// suite that only checked that something rendered.
//
// Proven here and nowhere else:
//   A · the หนี้ hero refuses to name a payoff date while the simulator cannot
//       see every outstanding debt, and names the real one when it can.
//   B · the hero and the Money Planner slider are one simulation: moving the
//       slider moves the hero's date to a pinned month.
//   C · credit cards are ONE source — deleting a card in the บัตรเครดิต tab
//       moves the ภาพรวม utilisation figure — a load failure is SAID, and a
//       missing table stays the one silent, graceful empty state.
//   D · the chart's average names its own denominator: one active month in a
//       twelve-slot window reads ฿30,000, not ฿2,500.
//   E · every DebtTracker action survived the restyle, reachable by its
//       accessible name.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import React from 'react';

import { FinanceView } from '../../src/pages/Finance.jsx';
import { DebtTracker } from '../../src/components/dashboard/DebtTracker.jsx';
import { currentYearMonth } from '../../src/lib/api/finance.js';
import { formatThaiMonth } from '../../src/components/dashboard/MonthNav.jsx';
import { __tables, __config } from '../mock-supabase.mjs';

const THIS = currentYearMonth();

/**
 * The expected Thai label N months from this one, computed INDEPENDENTLY of
 * the component's own helper — this is the pin, so it may not call it.
 */
function monthsFromNow(n) {
  const [y, m] = THIS.split('-').map(Number);
  const t = (m - 1) + n;
  const year = y + Math.floor(t / 12);
  const month = ((t % 12) + 12) % 12 + 1;
  return formatThaiMonth(`${year}-${String(month).padStart(2, '0')}`);
}

beforeEach(() => {
  cleanup();
  for (const k of Object.keys(__tables)) __tables[k] = [];
  __tables.credit_cards = [];
  __config.rpcHandlers = {};
  __config.missingColumns = {};
  __config.opFailures = {};
  __config.opFailurePredicate = null;
  // Mobile, so the six rooms are reachable through the tablist.
  vi.stubGlobal('matchMedia', (query) => ({
    matches: true, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }));
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
});

const openTab = async (name) => fireEvent.click(await screen.findByRole('tab', { name }));
const heroStat = (container, key) => {
  const hero = container.querySelector('[data-debt-hero]');
  if (!hero) return null;
  const cell = Array.from(hero.querySelectorAll('div'))
    .find(d => d.firstChild && d.firstChild.textContent === key && d.children.length >= 2);
  return cell;
};

/**
 * A 0%-rate revolving debt, so the payoff arithmetic is exact and pinnable:
 * ฿120,000 at ฿10,000/เดือน clears in 12 months on the minimum, and in 8 with
 * the default +฿5,000 (the pool is ฿15,000/เดือน, 120,000 / 15,000 = 8).
 */
const PLANNABLE = {
  id: 'debt-plan', user_id: 'user-1', scope: 'personal', name: 'ผ่อนของ 0%',
  type: 'installment', monthly_payment: 10000, due_day: 5,
  interest_rate: 0, remaining_balance: 120000, is_active: true,
};
/** Same money owed, but no rate — the simulator cannot see it at all. */
const UNPLANNABLE = {
  id: 'debt-gap', user_id: 'user-1', scope: 'personal', name: 'ไลน์ BK',
  type: 'loan', monthly_payment: 3000, due_day: 9,
  remaining_balance: 120000, is_active: true,
};

// ════════════════════════════════════════════════════════════════════════════
describe('A12·1 · hero “หมดหนี้” พูดได้เฉพาะตอนที่ simulator เห็นหนี้ครบทุกก้อน', () => {

  it('names the real payoff month when every outstanding debt is in the plan', async () => {
    __tables.debts.push({ ...PLANNABLE });
    const { container } = render(<FinanceView scope="personal" />);
    await openTab('หนี้');

    await waitFor(() => expect(container.querySelector('[data-debt-hero]')).toBeTruthy());
    const stat = await waitFor(() => {
      const el = heroStat(container, 'หมดหนี้');
      expect(el).toBeTruthy();
      return el;
    });
    // ฿120,000 ÷ ฿15,000/เดือน = 8 months, to the month.
    await waitFor(() => expect(stat.children[1].textContent).toBe(monthsFromNow(8)));
    expect(stat.children[1].textContent).not.toBe('—');
    // Nothing is scoped away, because nothing is missing.
    expect(container.querySelector('[data-plan-scope]')).toBeNull();
    expect(container.querySelector('[data-plan-scope-note]')).toBeNull();
  });

  it('refuses the date and prompts instead when a debt has no rate (the ฿120,000 that used to read “หมดหนี้ this month”)', async () => {
    // The exact shape of the audit's counterexample: real money owed, no rate,
    // so simulatePayoff drops it and would have returned month 0.
    __tables.debts.push({ ...UNPLANNABLE });
    const { container } = render(<FinanceView scope="personal" />);
    await openTab('หนี้');

    const stat = await waitFor(() => {
      const el = heroStat(container, 'หมดหนี้');
      expect(el).toBeTruthy();
      return el;
    });
    await waitFor(() => expect(stat.children[1].textContent).toBe('—'));
    expect(stat.children[2].textContent).toBe('ข้อมูลไม่ครบ · กรอกดอกเบี้ยอีก 1 ก้อน');
    // …and it never printed a Buddhist-year month anywhere in the stat.
    expect(stat.textContent).not.toMatch(/25\d\d/);
    // The hero still tells the truth about the balance itself.
    expect(container.querySelector('[data-debt-hero]').textContent).toContain('฿120,000');
  });

  // ── A12 r2 · Major — the counterexample the verify round ran against the
  //    shipped module: a 12/12 loan whose remaining_balance was never zeroed.
  //    summarizeDebts has always called it finished (คงเหลือรวม ฿0); the v4.61
  //    coverage helper re-derived "outstanding" from the stale column, said the
  //    plan was complete, and let the hero print a future date beside that ฿0.
  it('never dates a finished loan whose remaining_balance is stale — hero reads ฿0 and no date', async () => {
    __tables.debts.push({
      id: 'debt-done', user_id: 'user-1', scope: 'personal', name: 'โมนี่ 1',
      type: 'loan', monthly_payment: 19253, due_day: 5,
      total_months: 12, months_paid: 12, remaining_balance: 19253,
      interest_rate: 9, is_active: true,
    });
    const { container } = render(<FinanceView scope="personal" />);
    await openTab('หนี้');

    const hero = await waitFor(() => {
      const el = container.querySelector('[data-debt-hero]');
      expect(el).toBeTruthy();
      return el;
    });
    const stat = await waitFor(() => {
      const el = heroStat(container, 'หมดหนี้');
      expect(el).toBeTruthy();
      return el;
    });

    // The two halves of the hero agree: nothing is owed, so nothing is dated.
    await waitFor(() => expect(stat.children[1].textContent).toBe('—'));
    expect(hero.textContent).toContain('฿0');
    expect(stat.children[2].textContent).toBe('ยังไม่มียอดค้างให้คำนวณ');
    expect(hero.textContent).not.toMatch(/25\d\d/);
    // …and the burn figure does not bill a loan that is over either.
    expect(heroStat(container, 'ดอกเบี้ย/เดือน').children[1].textContent).toBe('฿0');
    // With nothing real to plan, the planner does not render a run at all.
    expect(container.querySelector('[data-clear-date]')).toBeNull();

    // ── A12 r3 · the advice card sits on this same screen and must agree.
    // It used to rank this loan #1 to pay off and print ฿143.32/เดือน of burn
    // from the stale balance, directly under a hero reading ฿0 — the suite went
    // green because nothing asserted on DebtAdvice here.
    expect(container.querySelectorAll('[data-prio-row]')).toHaveLength(0);
    expect(container.querySelector('[data-burn-permonth]')).toBeNull();
    expect(container.querySelector('[data-rollover]')).toBeNull();
    // A completed loan is not a "gap" either — there is nothing to fill in.
    expect(container.querySelector('[data-gap-note]')).toBeNull();
    expect(container.querySelector('[data-debt-advice]')).toBeNull();
    // The stale balance never becomes a figure the hero speaks with…
    expect(hero.textContent).not.toContain('19,253');
    // …and the ฿143.32/เดือน of phantom interest is nowhere on the room.
    const room = document.getElementById('fin-panel-debt');
    expect(room.textContent).not.toContain('143');
    // The tracker still lists it, correctly, as finished, with the archive
    // affordance — showing the row (and the stale figure the owner should fix)
    // is exactly its job. Only the ADVICE had to stop speaking for it.
    expect(room.textContent).toContain('โมนี่ 1');
    expect(room.textContent).toContain('ผ่อนหมดแล้ว');
  });

  // A row we know too LITTLE about is not the same as a row that is over: the
  // gap prompt must still nag for it, or the นudge that gets it filled in dies.
  it('still asks for a debt with no numbers at all, while ignoring the finished one', async () => {
    __tables.debts.push(
      { id: 'debt-done', user_id: 'user-1', scope: 'personal', name: 'โมนี่ 1', type: 'loan',
        monthly_payment: 19253, due_day: 5, total_months: 12, months_paid: 12,
        remaining_balance: 19253, interest_rate: 9, is_active: true },
      { id: 'debt-blank', user_id: 'user-1', scope: 'personal', name: 'เมืองทอง', type: 'loan',
        monthly_payment: 4000, due_day: 9, is_active: true },
    );
    const { container } = render(<FinanceView scope="personal" />);
    await openTab('หนี้');

    const gap = await waitFor(() => {
      const el = container.querySelector('[data-gap-note]');
      expect(el).toBeTruthy();
      return el;
    });
    // Exactly one gap: the unknown row. The finished one is not a gap.
    expect(gap.textContent).toContain('ข้อมูลหนี้ยังไม่ครบ 1 ก้อน');
    expect(gap.textContent).toContain('เมืองทอง');
    expect(gap.textContent).not.toContain('โมนี่ 1');
    // Still no ranking and no burn — neither row can carry a money figure.
    expect(container.querySelectorAll('[data-prio-row]')).toHaveLength(0);
    expect(container.querySelector('[data-burn-permonth]')).toBeNull();
  });

  // ── A12 r2 · Minor — the prompt names the field that is actually blank.
  it('asks for the BALANCE, not the rate, when the rate is already filled in', async () => {
    __tables.debts.push({
      id: 'debt-nobal', user_id: 'user-1', scope: 'personal', name: 'ผ่อนมือถือ',
      type: 'installment', monthly_payment: 5000, due_day: 9,
      total_months: 12, months_paid: 3, remaining_balance: null,
      interest_rate: 9, is_active: true,
    });
    const { container } = render(<FinanceView scope="personal" />);
    await openTab('หนี้');

    const stat = await waitFor(() => {
      const el = heroStat(container, 'หมดหนี้');
      expect(el).toBeTruthy();
      return el;
    });
    await waitFor(() => expect(stat.children[1].textContent).toBe('—'));
    // 9 instalments × ฿5,000 still owed, so it IS outstanding…
    expect(container.querySelector('[data-debt-hero]').textContent).toContain('฿45,000');
    // …and the missing field is the balance. The rate is already there.
    expect(stat.children[2].textContent).toBe('ข้อมูลไม่ครบ · กรอกยอดคงเหลืออีก 1 ก้อน');
    expect(stat.children[2].textContent).not.toContain('ดอกเบี้ย');
  });

  it('falls back to the neutral wording when a debt is missing both fields', async () => {
    __tables.debts.push(
      { id: 'd-rate', user_id: 'user-1', scope: 'personal', name: 'ไลน์ BK', type: 'loan',
        monthly_payment: 3000, due_day: 9, remaining_balance: 120000, is_active: true },
      { id: 'd-bal', user_id: 'user-1', scope: 'personal', name: 'ผ่อนมือถือ', type: 'installment',
        monthly_payment: 5000, due_day: 9, total_months: 12, months_paid: 3,
        remaining_balance: null, interest_rate: 9, is_active: true },
    );
    const { container } = render(<FinanceView scope="personal" />);
    await openTab('หนี้');

    const stat = await waitFor(() => {
      const el = heroStat(container, 'หมดหนี้');
      expect(el).toBeTruthy();
      return el;
    });
    await waitFor(() => expect(stat.children[1].textContent).toBe('—'));
    // One row wants a rate, the other a balance → name neither, count both.
    expect(stat.children[2].textContent).toBe('ข้อมูลไม่ครบ · กรอกข้อมูลหนี้อีก 2 ก้อน');
  });

  it('scopes the planner figures when only some debts are plannable', async () => {
    __tables.debts.push({ ...PLANNABLE }, { ...UNPLANNABLE });
    const { container } = render(<FinanceView scope="personal" />);
    await openTab('หนี้');

    const stat = await waitFor(() => {
      const el = heroStat(container, 'หมดหนี้');
      expect(el).toBeTruthy();
      return el;
    });
    // One of two debts is unplannable → still no date, and the count is exact.
    await waitFor(() => expect(stat.children[1].textContent).toBe('—'));
    expect(stat.children[2].textContent).toBe('ข้อมูลไม่ครบ · กรอกดอกเบี้ยอีก 1 ก้อน');

    // The planner says which debts its own two figures and chips cover.
    await waitFor(() => expect(container.querySelector('[data-plan-scope]')).toBeTruthy());
    expect(container.querySelector('[data-plan-scope]').textContent)
      .toBe('เฉพาะหนี้ที่กรอกครบ 1 จาก 2 ก้อน');
    expect(container.querySelector('[data-plan-scope-note]').textContent)
      .toContain('ยังไม่รวม ไลน์ BK');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('A12·2 · hero กับสไลเดอร์เป็นการจำลองเดียวกัน', () => {

  it('moves the hero date to the pinned month when the slider moves', async () => {
    __tables.debts.push({ ...PLANNABLE });
    const { container } = render(<FinanceView scope="personal" />);
    await openTab('หนี้');

    const stat = await waitFor(() => {
      const el = heroStat(container, 'หมดหนี้');
      expect(el).toBeTruthy();
      return el;
    });
    // Default extra +฿5,000 → pool ฿15,000 → 8 months.
    await waitFor(() => expect(stat.children[1].textContent).toBe(monthsFromNow(8)));

    // Drop to the minimum → pool ฿10,000 → 12 months, on BOTH surfaces.
    fireEvent.change(container.querySelector('[data-extra-slider]'), { target: { value: '0' } });

    await waitFor(() => expect(stat.children[1].textContent).toBe(monthsFromNow(12)));
    expect(container.querySelector('[data-clear-date]').textContent).toBe(monthsFromNow(12));
    expect(container.querySelector('[data-extra-value]').textContent).toBe('฿0 /เดือน');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('A12·4 · บัตรเครดิตมีแหล่งเดียว และความล้มเหลวไม่เงียบ', () => {

  const card = (over) => ({
    id: 'x', user_id: 'user-1', scope: 'personal', name: 'บัตร', status: 'active',
    pays_full: true, credit_limit: null, shared_limit_card_id: null,
    manual_balance: null, debt_id: null, statement_day: null, due_day: null,
    waiver_mode: 'none', fee_profile: {}, installments: [], sort_order: 0,
    ...over,
  });

  it('CRUD in the บัตรเครดิต tab moves the ภาพรวม utilisation figure', async () => {
    // ฿25,000 + ฿75,000 owed against ฿200,000 of line = 50.0%.
    __tables.credit_cards.push(
      card({ id: 'card-a', name: 'บัตรเอ', credit_limit: 100000, manual_balance: 25000, sort_order: 0 }),
      card({ id: 'card-b', name: 'บัตรบี', credit_limit: 100000, manual_balance: 75000, sort_order: 1 }),
    );
    const { container } = render(<FinanceView scope="personal" />);

    const row = await waitFor(() => {
      const el = container.querySelector('[data-health-row="utilization"]');
      expect(el).toBeTruthy();
      return el;
    });
    expect(row.textContent).toContain('50.0%');
    expect(row.textContent).toContain('฿100,000 / ฿200,000');

    // Delete บัตรบี in the tab. Before v4.61 the tab reloaded its OWN copy and
    // this figure stayed at 50.0% until the page was refreshed.
    await openTab('บัตรเครดิต');
    fireEvent.click(await screen.findByRole('button', { name: 'ลบ บัตรบี' }));

    await waitFor(() => expect(__tables.credit_cards).toHaveLength(1));
    // ฿25,000 against ฿100,000 = 25.0%, on the ภาพรวม row, with no reload.
    await waitFor(() => expect(
      container.querySelector('[data-health-row="utilization"]').textContent,
    ).toContain('25.0%'));
    expect(container.querySelector('[data-health-row="utilization"]').textContent)
      .toContain('฿25,000 / ฿100,000');
  });

  it('says so when the card read fails — the row must not just vanish', async () => {
    __tables.credit_cards.push(
      card({ id: 'card-a', name: 'บัตรเอ', credit_limit: 100000, manual_balance: 25000 }),
    );
    __config.opFailurePredicate = ({ op, table }) => op === 'select' && table === 'credit_cards';

    const { container } = render(<FinanceView scope="personal" />);

    await waitFor(() => expect(screen.getByText(/โหลดข้อมูล .*บัตรเครดิต.* ไม่สำเร็จ/)).toBeTruthy());
    // The health row is absent — but the banner explains why, and offers a retry.
    expect(container.querySelector('[data-health-row="utilization"]')).toBeNull();
    expect(screen.getByRole('button', { name: /ลองใหม่/ })).toBeTruthy();
  });

  it('stays silent for the ONE graceful case — the table is not installed yet', async () => {
    const saved = __tables.credit_cards;
    delete __tables.credit_cards;                 // production before the migration
    try {
      const { container } = render(<FinanceView scope="personal" />);
      await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(6));
      await waitFor(() => expect(container.querySelector('[data-recent-group], [data-health-group], [data-overview-hero]')).toBeTruthy());

      expect(screen.queryByText(/โหลดข้อมูล .*บัตรเครดิต.* ไม่สำเร็จ/)).toBeNull();
      expect(container.querySelector('[data-health-row="utilization"]')).toBeNull();
    } finally { __tables.credit_cards = saved; }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('A12·3 · ค่าเฉลี่ยบนหัวกราฟบอกตัวหารของตัวเอง', () => {

  it('reads ฿30,000 for one active month in a twelve-month window, and says 1 จาก 12', async () => {
    __tables.transactions.push({
      id: 'inc-1', user_id: 'user-1', scope: 'personal', title: 'เงินเดือน',
      amount: 30000, category: 'รายรับ', type: 'income',
      occurred_at: `${THIS}-05T12:00:00+07:00`,
    });
    const { container } = render(<FinanceView scope="personal" />);

    const readout = await waitFor(() => {
      const el = container.querySelector('[data-avg-readout]');
      expect(el).toBeTruthy();
      return el;
    });
    // The window average would be ฿2,500. This one says which months it used.
    expect(readout.textContent).toBe('เฉลี่ยเดือนที่มีรายการ เหลือ ฿30,000/เดือน (1 จาก 12 เดือน)');
    expect(readout.textContent).not.toContain('฿2,500');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('A12·5 · ทุกปุ่มของตารางหนี้ยังอยู่ครบหลังเปลี่ยนหน้าตา', () => {

  const base = {
    user_id: 'user-1', scope: 'personal', type: 'loan',
    monthly_payment: 5000, due_day: 5, is_active: true,
  };

  it('a pending debt offers mark-paid, edit, delete, add, Forecast and Strategy by name', () => {
    const debts = [
      { ...base, id: 'd1', name: 'ก้อนหนึ่ง', remaining_balance: 50000, interest_rate: 9 },
      { ...base, id: 'd2', name: 'ก้อนสอง', remaining_balance: 60000, interest_rate: 12 },
    ];
    render(<DebtTracker debts={debts} payments={[]} yearMonth={THIS} scope="personal" onChange={() => {}} />);

    expect(screen.getAllByRole('button', { name: /บันทึกว่าจ่ายแล้ว/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'แก้ไข' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'ลบ' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: '+ เพิ่ม' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Forecast' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'โปะหนี้' })).toBeTruthy();

    // The add form really opens from that button.
    fireEvent.click(screen.getByRole('button', { name: '+ เพิ่ม' }));
    expect(screen.getByPlaceholderText(/BMW Leasing/)).toBeTruthy();
  });

  it('a paid debt offers the unmark, and a finished one offers the archive', () => {
    const paid = [{ ...base, id: 'd1', name: 'ก้อนหนึ่ง', remaining_balance: 50000, interest_rate: 9 }];
    const payments = [{ id: 'p1', debt_id: 'd1', pay_month: `${THIS}-01`, amount_paid: 5000,
      paid_at: `${THIS}-03T12:00:00+07:00` }];
    const { unmount } = render(
      <DebtTracker debts={paid} payments={payments} yearMonth={THIS} scope="personal" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /ยกเลิก/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /บันทึกว่าจ่ายแล้ว/ })).toBeNull();
    unmount();

    const done = [{ ...base, id: 'd2', name: 'ก้อนจบ', total_months: 12, months_paid: 12,
      start_date: '2025-08-01', remaining_balance: 0 }];
    render(<DebtTracker debts={done} payments={[]} yearMonth={THIS} scope="personal" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /เก็บเข้าคลัง/ })).toBeTruthy();
  });

  it('shows the blue กรอกเพิ่ม prompt — never a red warning — on an incomplete debt', () => {
    const debts = [{ ...base, id: 'd1', name: 'ไลน์ BK', remaining_balance: 120000 }];
    const { container } = render(
      <DebtTracker debts={debts} payments={[]} yearMonth={THIS} scope="personal" onChange={() => {}} />);

    expect(screen.getByText('ขาดอัตราดอกเบี้ย — กรอกเพิ่ม')).toBeTruthy();
    const pill = screen.getByText('ขาดอัตราดอกเบี้ย — กรอกเพิ่ม');
    expect(pill.getAttribute('style')).toContain('var(--accent-strong)');
    expect(pill.getAttribute('style')).not.toContain('var(--danger)');
    // The rate cell says it does not know, rather than inventing a figure.
    expect(container.textContent).toContain('?%');
  });
});

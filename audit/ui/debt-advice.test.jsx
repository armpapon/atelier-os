// Mounted acceptance for the คำแนะนำเรื่องหนี้ card (v4.46).
//
// Proven here (and only here, because "renders nothing" is a claim only the
// real component can answer):
//   1. The interest-burn headline shows the summed ฿/เดือน (active debts only).
//   2. The ranked payoff rows read in avalanche order (highest rate first).
//   3. A near-done debt surfaces as a green "โอกาสใกล้ตัว" rollover callout,
//      naming the debt and the money it frees.
//   4. A qualifying credit card raises the ⏰ minimum-payment deadline callout.
//   5. Debts missing a rate/balance produce the data-gap note by name.
//   6. A gap-only scope (every debt missing rate/balance) renders a COMPACT
//      data-gap notice prompting the owner to fill the data in — the corrected
//      A8-3 expectation. It is a real render, not "nothing": the scope that most
//      needs the prompt used to hide it. Only a genuinely empty scope renders nothing.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

import { DebtAdvice } from '../../src/components/dashboard/DebtAdvice.jsx';

afterEach(cleanup);

// Synthetic — never the owner's real balances.
//  KTC card 60,000 @ 16% → ฿800/ด   (avalanche #1, credit_card)
//  รถ      120,000 @ 9%  → ฿900/ด   (#2)
//  ค่าบ้าน  1,000,000 @ 4.8% → ฿4,000/ด (#3, low-rate-no-rush)
//  Shopee  near-done rollover (2 งวดเหลือ), no rate/balance → gap too
//  เมืองทอง no rate/balance → gap only
const DEBTS = [
  { id: 'ktc',   name: 'บัตร KTC', type: 'credit_card', remaining_balance: 60000,   interest_rate: 16 },
  { id: 'car',   name: 'รถ BMW',   type: 'lease',       remaining_balance: 120000,  interest_rate: 9 },
  { id: 'home',  name: 'ค่าบ้าน',   type: 'mortgage',    remaining_balance: 1000000, interest_rate: 4.8 },
  { id: 'shopee', name: 'Shopee Cash', type: 'installment', monthly_payment: 3661, total_months: 6, months_paid: 4 },
  { id: 'mtt',   name: 'เมืองทอง', type: 'loan' },
];

const names = (c) => Array.from(c.querySelectorAll('[data-prio-name]')).map(e => e.textContent);

describe('คำแนะนำเรื่องหนี้ · การ์ดคำนวณบนแท็บหนี้ (v4.46)', () => {

  it('shows the summed interest-burn headline (active debts only)', () => {
    const { container } = render(<DebtAdvice debts={DEBTS} />);
    // 800 + 900 + 4000 = 5,700/เดือน; ~68,400/ปี.
    expect(container.querySelector('[data-burn-permonth]').textContent).toBe('฿5,700');
    expect(container.textContent).toContain('~฿68,400/ปี');
  });

  it('ranks the payoff rows in avalanche order — highest rate first', () => {
    const { container } = render(<DebtAdvice debts={DEBTS} />);
    expect(names(container)).toEqual(['บัตร KTC', 'รถ BMW', 'ค่าบ้าน']);
    // The #1 row carries the highest-rate reason and the bureau pill.
    const top = container.querySelector('[data-prio-rank="1"]');
    expect(top.textContent).toContain('โปะก่อน: อัตราดอกสูงสุดในพอร์ต');
    expect(top.textContent).toContain('ดีต่อบูโร');
    // The mortgage is the lowest rate under 6% → don't-rush copy.
    const third = container.querySelector('[data-prio-rank="3"]');
    expect(third.textContent).toContain('ไม่ต้องเร่งโปะ');
  });

  it('surfaces the near-done debt as a rollover win callout', () => {
    const { container } = render(<DebtAdvice debts={DEBTS} />);
    const win = container.querySelector('[data-rollover]');
    expect(win).toBeTruthy();
    expect(win.textContent).toContain('Shopee Cash');
    expect(win.textContent).toContain('~2 งวด');
    expect(win.textContent).toContain('฿3,661/เดือน');
  });

  it('raises the credit-card minimum-payment deadline callout', () => {
    const { container } = render(<DebtAdvice debts={DEBTS} />);
    const warn = container.querySelector('[data-deadline]');
    expect(warn).toBeTruthy();
    expect(warn.textContent).toContain('ม.ค. 2570');
    // 60,000 × 8% = 4,800 now → × 10% = 6,000 future.
    expect(warn.textContent).toContain('฿4,800');
    expect(warn.textContent).toContain('฿6,000');
  });

  it('lists the debts with missing data in the gap note', () => {
    const { container } = render(<DebtAdvice debts={DEBTS} />);
    const gap = container.querySelector('[data-gap-note]');
    expect(gap).toBeTruthy();
    expect(gap.textContent).toContain('ข้อมูลยังไม่ครบ 2 ก้อน');
    expect(gap.textContent).toContain('Shopee Cash');
    expect(gap.textContent).toContain('เมืองทอง');
    // The headline warns the burn is understated when gaps exist.
    expect(container.textContent).toContain('ยังไม่ได้กรอกดอก/ยอด');
  });

  it('renders a compact data-gap notice for a gap-only scope (A8-3)', () => {
    // Every debt is missing rate AND balance → no burn, no ranking, no rollover,
    // no deadline. This is the scope that most needs the prompt, so it must show
    // the compact fill-in-your-data card — NOT hide itself (the pre-A8 behaviour).
    const { container } = render(
      <DebtAdvice debts={[{ id: 'x', name: 'ไม่รู้อะไรเลย', type: 'loan' }]} />,
    );
    const card = container.querySelector('[data-debt-advice-compact]');
    expect(card).toBeTruthy();
    const gap = container.querySelector('[data-gap-note]');
    expect(gap.textContent).toContain('ข้อมูลหนี้ยังไม่ครบ 1 ก้อน');
    expect(gap.textContent).toContain('ไม่รู้อะไรเลย');
    // The compact card carries no burn headline — there's no honest number yet.
    expect(container.querySelector('[data-burn-permonth]')).toBeNull();
  });

  it('renders nothing for a genuinely empty scope', () => {
    const { container } = render(<DebtAdvice debts={[]} />);
    expect(container.querySelector('[data-debt-advice]')).toBeNull();
    expect(container.textContent).toBe('');
  });
});

// Mounted acceptance for the Money Planner payoff simulator (v4.48).
//
// Proven here (and only here, because "renders nothing" and slider recompute
// are claims only the real component can answer):
//   1. The hero shows a Thai clear-date and the interest-saved figure.
//   2. One timeline row per plan debt, each with its own Thai clear-date.
//   3. Moving the slider (fireEvent) recomputes the numbers.
//   4. A mortgage-shaped fixture (payment < interest) raises the ⚠️ note.
//   5. A scope with no plan-worthy debt renders nothing.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

import { MoneyPlanner } from '../../src/components/dashboard/MoneyPlanner.jsx';

afterEach(cleanup);

// Synthetic — never the owner's real balances.
//  Two 16% cards + a mortgage whose 15,000 payment is below its ~16,067 interest.
const DEBTS = [
  { id: 'c1',   name: 'KTC MC',   remaining_balance: 50000,   interest_rate: 16,   monthly_payment: 4000 },
  { id: 'c2',   name: 'KTC VISA', remaining_balance: 60000,   interest_rate: 16,   monthly_payment: 4800 },
  { id: 'home', name: 'ค่าบ้าน',   remaining_balance: 4000000, interest_rate: 4.82, monthly_payment: 15000 },
];

describe('Money Planner · ตัวจำลองโปะหนี้บนแท็บหนี้ (v4.48)', () => {

  it('renders the hero clear-date and the interest-saved figure', () => {
    const { container } = render(<MoneyPlanner debts={DEBTS} />);
    // A Thai Buddhist-year label (e.g. "ก.ย. 2570") — month name + a 25xx year.
    const clearDate = container.querySelector('[data-clear-date]').textContent;
    expect(clearDate).toMatch(/25\d\d/);
    // Interest-saved renders a baht figure (default extra = 5,000 → saving > 0).
    const saved = container.querySelector('[data-interest-saved]').textContent;
    expect(saved.startsWith('฿')).toBe(true);
    expect(saved).not.toBe('฿0');
  });

  it('renders one timeline row per plan debt, each with a Thai date', () => {
    const { container } = render(<MoneyPlanner debts={DEBTS} />);
    const rows = container.querySelectorAll('[data-timeline-row]');
    expect(rows.length).toBe(3); // all three have rate + balance → all plan debts
    container.querySelectorAll('[data-timeline-when]').forEach((el) => {
      expect(el.textContent).toMatch(/25\d\d/);
    });
    // The card names appear in the timeline.
    expect(container.textContent).toContain('KTC MC');
    expect(container.textContent).toContain('ค่าบ้าน');
  });

  it('recomputes the numbers when the slider moves', () => {
    const { container } = render(<MoneyPlanner debts={DEBTS} />);
    const slider = container.querySelector('[data-extra-slider]');
    const savedAt5k = container.querySelector('[data-interest-saved]').textContent;
    const valueAt5k = container.querySelector('[data-extra-value]').textContent;
    expect(valueAt5k).toBe('+5,000฿');

    fireEvent.change(slider, { target: { value: '15000' } });

    expect(container.querySelector('[data-extra-value]').textContent).toBe('+15,000฿');
    // More money down → strictly more interest saved than at +5,000.
    const savedAt15k = container.querySelector('[data-interest-saved]').textContent;
    expect(savedAt15k).not.toBe(savedAt5k);
    const num = (s) => Number(s.replace(/[฿,]/g, ''));
    expect(num(savedAt15k)).toBeGreaterThan(num(savedAt5k));
  });

  it('raises the payment-below-interest note for a mortgage-shaped fixture', () => {
    const { container } = render(<MoneyPlanner debts={DEBTS} />);
    const note = container.querySelector('[data-below-interest]');
    expect(note).toBeTruthy();
    expect(note.textContent).toContain('ค่าบ้าน');
    expect(note.textContent).toContain('฿15,000/เดือน');
    expect(note.textContent).toContain('ต่ำกว่าดอกเบี้ยต่อเดือน');
    // The cards (payment above interest) are not named in the note.
    expect(note.textContent).not.toContain('KTC MC');
  });

  it('renders nothing when no debt is plan-worthy (no rate/balance)', () => {
    const { container } = render(
      <MoneyPlanner debts={[{ id: 'x', name: 'ไม่รู้อะไรเลย', type: 'loan' }]} />,
    );
    expect(container.querySelector('[data-money-planner]')).toBeNull();
    expect(container.textContent).toBe('');
  });
});

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
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
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
    // v4.59 — the big number reads "+฿5,000 /เดือน" (the phase-3 headline
    // format). Same claim, same element: the slider's value is on screen.
    expect(valueAt5k).toBe('+฿5,000 /เดือน');

    fireEvent.change(slider, { target: { value: '15000' } });

    expect(container.querySelector('[data-extra-value]').textContent).toBe('+฿15,000 /เดือน');
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

  // A9 · Major 3 — a run that can't clear within 60 years is CENSORED: the UI
  // must say "นานเกิน 60 ปี" and never show a fabricated ฿ saved / พ.ศ. date.
  it('shows the censored text and NO exact savings when a run never clears', () => {
    // 1,000,000 @ 24% (2%/เดือน), ค่างวด 1,000 → interest 20,000/เดือน dwarfs the
    // payment; even the default +5,000 extra can't out-run it → censored.
    const HEAVY = [
      { id: 'big', name: 'ก้อนโต', remaining_balance: 1000000, interest_rate: 24, monthly_payment: 1000 },
    ];
    const { container } = render(<MoneyPlanner debts={HEAVY} />);
    // Savings tile shows the censored wording, not a baht figure.
    const saved = container.querySelector('[data-interest-saved]').textContent;
    expect(saved).toBe('เทียบไม่ได้');
    expect(saved.startsWith('฿')).toBe(false);
    expect(container.textContent).toContain('แผนนี้ใช้เวลานานเกิน 60 ปี');
    // The clear-date hero falls back to the "นานเกิน 60 ปี" copy, not a พ.ศ. date.
    expect(container.querySelector('[data-clear-date]').textContent).toBe('นานเกิน 60 ปี');
    // The uncleared debt's timeline reads "เกิน 60 ปี", never an exact date.
    const when = container.querySelector('[data-timeline-when]').textContent;
    expect(when).toBe('เกิน 60 ปี');
    expect(when).not.toMatch(/25\d\d/);
  });

  // A9 · Major 2 + Minor 5 — the rollover ("เงินจาก …") preset is gone: the
  // automatic rollover already frees a cleared debt's payment, so re-adding it
  // as extra double-counts. Only the four fixed presets remain, each equal to
  // its own label (no clamp mismatch).
  it('offers only the four fixed presets — no "เงินจาก" rollover chip', () => {
    // A near-done instalment (1 งวดเหลือ, frees ฿30,000) used to spawn the chip.
    const WITH_ROLLOVER = [
      { id: 'card', name: 'บัตร',   remaining_balance: 50000, interest_rate: 16, monthly_payment: 4000 },
      { id: 'soon', name: 'Shopee', remaining_balance: 30000, interest_rate: 5,  monthly_payment: 30000, total_months: 6, months_paid: 5 },
    ];
    const { container } = render(<MoneyPlanner debts={WITH_ROLLOVER} />);
    const chips = Array.from(container.querySelectorAll('[data-preset]'));
    expect(chips.map(c => c.textContent)).toEqual(['จ่ายขั้นต่ำ', '+5,000', '+10,000', '+20,000']);
    // No preset mentions "เงินจาก" (the removed rollover chip).
    expect(container.textContent).not.toContain('เงินจาก');
    // Every preset's numeric value matches its label (Minor 5: no clamp drift).
    expect(chips.map(c => c.getAttribute('data-preset'))).toEqual(['0', '5000', '10000', '20000']);
  });

  // A9 · Minor 7 — the range has an accessible name for screen readers.
  it('gives the extra-payment slider an accessible name', () => {
    render(<MoneyPlanner debts={DEBTS} />);
    expect(screen.getByRole('slider', { name: 'เพิ่มเงินโปะต่อเดือน' })).toBeTruthy();
  });
});

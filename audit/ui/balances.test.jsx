// Mounted acceptance for audit batch A / B4 — the Finance page must never
// present raw balance anchors as confirmed effective balances.
//
// The real FinanceView is rendered against the same mock PostgREST the rest
// of the harness uses; only the ONE read that applyEffectiveBalances issues
// (`account_id, amount, occurred_at` on transactions) is made to fail, so the
// rest of the page loads exactly as it does in production.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

import { FinanceView } from '../../src/pages/Finance.jsx';
import { __tables, __config } from '../mock-supabase.mjs';

/** The read applyEffectiveBalances makes — nothing else on the page shares it. */
const EFFECTIVE_BALANCE_READ = ({ op, table, selectCols }) =>
  op === 'select' && table === 'transactions' && selectCols === 'account_id, amount, occurred_at';

const ANCHOR_AT = '2026-08-01T12:00:00+07:00';

function seed() {
  __tables.accounts.push(
    { id: 'acc-a', user_id: 'user-1', name: 'KBank ออมทรัพย์', type: 'savings', scope: 'personal',
      balance: 10000, balance_anchor_at: ANCHOR_AT, is_active: true, is_emergency_fund: true, tone: 'amber' },
    { id: 'acc-b', user_id: 'user-1', name: 'กระปุก', type: 'cash', scope: 'personal',
      balance: 300, is_active: true, tone: 'profit' },
  );
  // −2,500 AFTER the anchor: the confirmed balance is 7,500, the anchor 10,000.
  __tables.transactions.push({
    id: 'tx-after', user_id: 'user-1', scope: 'personal', account_id: 'acc-a',
    title: 'ค่าเช่า', amount: -2500, category: 'บ้าน', type: 'home',
    occurred_at: '2026-08-04T12:00:00+07:00',
  });
}

beforeEach(() => {
  cleanup();
  for (const k of Object.keys(__tables)) __tables[k] = [];
  __config.rpcHandlers = {};
  __config.missingColumns = {};
  __config.opFailures = {};
  __config.opFailurePredicate = null;
  // jsdom has no matchMedia; useMediaQuery needs one.
  vi.stubGlobal('matchMedia', (query) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }));
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => { __config.opFailurePredicate = null; });

describe('Finance balances honesty (batch A · B4)', () => {

  it('the overlay succeeding shows the CONFIRMED balance and no warning', async () => {
    seed();
    render(<FinanceView scope="personal" />);

    // 10,000 − 2,500 — the account row and the emergency-fund total.
    expect((await screen.findAllByText(/฿7,500/)).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/คำนวณยอดคงเหลือปัจจุบันไม่สำเร็จ/)).toBeNull();
    expect(screen.queryAllByText(/ยังไม่ยืนยัน/)).toHaveLength(0);
    expect(screen.getByText(/\+ รายการหลังจากนั้น/)).toBeTruthy();
  });

  it('the overlay failing raises the amber warning and labels every balance unconfirmed', async () => {
    seed();
    __config.opFailurePredicate = EFFECTIVE_BALANCE_READ;
    render(<FinanceView scope="personal" />);

    // 1 · a distinct amber warning, with a retry action.
    const warning = await screen.findByText(/คำนวณยอดคงเหลือปัจจุบันไม่สำเร็จ/);
    expect(warning.textContent).toMatch(/ยังไม่ยืนยัน/);
    expect(warning.textContent).toMatch(/ยังไม่รวมรายการหลังจากนั้น/);

    // 2 · the raw anchor is NOT presented as the effective balance.
    expect(screen.queryAllByText(/฿7,500/)).toHaveLength(0);
    expect(screen.queryAllByText(/\+ รายการหลังจากนั้น/)).toHaveLength(0);
    expect(document.body.textContent).toContain('฿10,000');   // the raw anchor, labelled

    // 3 · the anchored balance, Net Worth and the emergency fund are all
    //     labelled — three surfaces, plus the account-list row and total.
    await waitFor(() => {
      expect(screen.getAllByText(/ยังไม่ยืนยัน/).length).toBeGreaterThanOrEqual(4);
    });
    expect(screen.getAllByText(/ยังไม่รวมรายการหลังวันตั้งต้น/)).toHaveLength(2); // NetWorth + EmergencyFund
    // The account row itself says its anchor is not topped up (the banner
    // uses the same wording, hence two).
    expect(screen.getAllByText(/ยังไม่รวมรายการหลังจากนั้น/)).toHaveLength(2);

    // 4 · retry — the read succeeds this time, the labels clear, the real
    //     number appears.
    __config.opFailurePredicate = null;
    fireEvent.click(screen.getAllByRole('button', { name: /ลองใหม่/ })[0]);
    await screen.findAllByText(/฿7,500/);
    expect(screen.queryByText(/คำนวณยอดคงเหลือปัจจุบันไม่สำเร็จ/)).toBeNull();
    expect(screen.queryAllByText(/ยังไม่ยืนยัน/)).toHaveLength(0);
  });

  it('an account with no anchor is never labelled — nothing about it is in doubt', async () => {
    // Only the un-anchored account exists, so no overlay is owed at all.
    __tables.accounts.push({ id: 'acc-b', user_id: 'user-1', name: 'กระปุก', type: 'cash',
      scope: 'personal', balance: 300, is_active: true, tone: 'profit' });
    __config.opFailurePredicate = EFFECTIVE_BALANCE_READ;
    render(<FinanceView scope="personal" />);

    await screen.findAllByText(/กระปุก/);
    expect(screen.queryByText(/คำนวณยอดคงเหลือปัจจุบันไม่สำเร็จ/)).toBeNull();
    expect(screen.queryAllByText(/ยังไม่ยืนยัน/)).toHaveLength(0);
  });
});

// Mounted acceptance for audit batch C — the parts a user can only reach
// through the real components: the archive flow in AccountModal (B3), the
// transfer-pair delete in the transaction list (B5), and the completed-debt
// state in DebtTracker (B8).
//
// Same mock PostgREST as the rest of the harness (aliased in
// vitest.config.mjs), so an RPC is "not installed" unless a test installs it.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

import { FinanceView } from '../../src/pages/Finance.jsx';
import { DebtTracker } from '../../src/components/dashboard/DebtTracker.jsx';
import { currentYearMonth, nextMonth } from '../../src/lib/api/finance.js';
import { __tables, __config, __stats } from '../mock-supabase.mjs';

const THIS = currentYearMonth();
const NEXT = nextMonth(THIS);

let confirmSpy, alertSpy;

beforeEach(() => {
  cleanup();
  for (const k of Object.keys(__tables)) __tables[k] = [];
  __config.rpcHandlers = {};
  __config.missingColumns = {};
  __config.opFailures = {};
  __config.opFailurePredicate = null;
  __stats.rpcCalls.length = 0;
  // MOBILE viewport, explicitly. jsdom has no real matchMedia, and since v4.38
  // the in-page tablist renders only under MOBILE_QUERY — on desktop the six
  // rooms are reached from the sidebar instead. Every claim below is about the
  // tablist, so the mock says mobile out loud rather than relying on a default.
  vi.stubGlobal('matchMedia', (query) => ({
    matches: true, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }));
  alertSpy = vi.fn();
  confirmSpy = vi.fn(() => true);
  vi.stubGlobal('alert', alertSpy);
  vi.stubGlobal('confirm', confirmSpy);
});

/** Since v4.35 the page is six sub-tabs — open the room under test. */
const openTab = async (name) =>
  fireEvent.click(await screen.findByRole('tab', { name }));

// ════════════════════════════════════════════════════════════════════════════
describe('B3 · reassign + archive goes through one transactional call', () => {

  const seedAccounts = () => {
    __tables.accounts.push(
      { id: 'acc-src', user_id: 'user-1', name: 'ซองเก่า', type: 'savings',
        scope: 'personal', balance: 0, is_active: true, tone: 'amber' },
      { id: 'acc-dst', user_id: 'user-1', name: 'ซองใหม่', type: 'savings',
        scope: 'personal', balance: 0, is_active: true, tone: 'profit' },
    );
    __tables.transactions.push(
      { id: 'tx-1', user_id: 'user-1', scope: 'personal', account_id: 'acc-src',
        title: 'ค่ากาแฟ', amount: -65, category: 'อาหาร', type: 'food',
        occurred_at: `${THIS}-04T12:00:00+07:00` },
    );
  };

  it('the modal calls reassign_and_archive_account — not two separate writes', async () => {
    seedAccounts();
    let rpcArgs = null;
    __config.rpcHandlers['reassign_and_archive_account'] = (args) => {
      rpcArgs = args;
      __tables.transactions.forEach(t => {
        if (t.account_id === args.p_from) t.account_id = args.p_to;
      });
      __tables.accounts.find(a => a.id === args.p_from).is_active = false;
      return { data: 1, error: null };
    };

    render(<FinanceView scope="personal" />);
    await openTab('บัญชี');
    fireEvent.click(await screen.findByRole('button', { name: 'แก้ไขบัญชี ซองเก่า' }));

    // Pick the move target, then archive.
    const target = await screen.findByRole('option', { name: /ย้ายรายการทั้งหมดไป → ซองใหม่/ });
    fireEvent.change(target.closest('select'), { target: { value: 'acc-dst' } });
    fireEvent.click(screen.getByRole('button', { name: /เก็บบัญชีนี้/ }));

    await waitFor(() => expect(rpcArgs).not.toBeNull());
    expect(rpcArgs).toEqual({ p_from: 'acc-src', p_to: 'acc-dst' });
    // One transactional call — no separate transactions UPDATE was issued.
    expect(__tables.transactions[0].account_id).toBe('acc-dst');
    expect(__tables.accounts.find(a => a.id === 'acc-src').is_active).toBe(false);
  });

  it('the RPC refusing leaves both accounts and the transaction link untouched', async () => {
    seedAccounts();
    __config.rpcHandlers['reassign_and_archive_account'] =
      () => ({ data: null, error: { code: 'P0001', message: 'บัญชีปลายทางไม่ใช่ของผู้ใช้นี้' } });

    render(<FinanceView scope="personal" />);
    await openTab('บัญชี');
    fireEvent.click(await screen.findByRole('button', { name: 'แก้ไขบัญชี ซองเก่า' }));
    const target = await screen.findByRole('option', { name: /ย้ายรายการทั้งหมดไป → ซองใหม่/ });
    fireEvent.change(target.closest('select'), { target: { value: 'acc-dst' } });
    fireEvent.click(screen.getByRole('button', { name: /เก็บบัญชีนี้/ }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(alertSpy.mock.calls[0][0]).toMatch(/บัญชีปลายทางไม่ใช่ของผู้ใช้นี้/);
    expect(__tables.transactions[0].account_id).toBe('acc-src');
    expect(__tables.accounts.find(a => a.id === 'acc-src').is_active).toBe(true);
    expect(__tables.accounts.find(a => a.id === 'acc-dst').is_active).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('B5 · deleting one leg of a transfer takes the pair', () => {

  const seedPair = (groupId) => {
    __tables.transactions.push(
      { id: 'leg-out', user_id: 'user-1', scope: 'personal', title: 'โอนไปครอบครัว',
        amount: -8000, category: 'โอนภายใน', type: 'transfer',
        occurred_at: `${THIS}-02T12:00:00+07:00`, transfer_group_id: groupId },
      { id: 'leg-in', user_id: 'user-1', scope: 'family', title: 'รับจากส่วนตัว',
        amount: 8000, category: 'โอนภายใน', type: 'transfer',
        occurred_at: `${THIS}-02T12:00:00+07:00`, transfer_group_id: groupId },
    );
  };

  it('the confirm names BOTH sides and both legs disappear', async () => {
    seedPair('grp-1');
    render(<FinanceView scope="personal" />);
    await openTab('รายการ');

    await screen.findByText('โอนไปครอบครัว');
    fireEvent.click(screen.getByRole('button', { name: 'ลบ' }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    const msg = confirmSpy.mock.calls[0][0];
    expect(msg).toMatch(/ลบเงินโอนนี้ทั้งคู่/);
    expect(msg).toMatch(/ส่วนตัว: −฿8,000 · โอนไปครอบครัว/);
    expect(msg).toMatch(/ครอบครัว: \+฿8,000 · รับจากส่วนตัว/);

    await waitFor(() => expect(__tables.transactions).toHaveLength(0));
  });

  it('cancelling the confirm deletes nothing at all', async () => {
    seedPair('grp-2');
    confirmSpy.mockReturnValue(false);
    render(<FinanceView scope="personal" />);
    await openTab('รายการ');

    await screen.findByText('โอนไปครอบครัว');
    fireEvent.click(screen.getByRole('button', { name: 'ลบ' }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(__tables.transactions).toHaveLength(2);
  });

  it('an ungrouped legacy leg warns that the counterpart survives', async () => {
    __tables.transactions.push(
      { id: 'old-out', user_id: 'user-1', scope: 'personal', title: 'โอนไปครอบครัว',
        amount: -5000, category: 'โอนภายใน', type: 'transfer',
        occurred_at: `${THIS}-03T12:00:00+07:00` },
      { id: 'old-in', user_id: 'user-1', scope: 'family', title: 'รับจากส่วนตัว',
        amount: 5000, category: 'โอนภายใน', type: 'transfer',
        occurred_at: `${THIS}-03T12:00:00+07:00` },
    );
    render(<FinanceView scope="personal" />);
    await openTab('รายการ');

    await screen.findByText('โอนไปครอบครัว');
    fireEvent.click(screen.getByRole('button', { name: 'ลบ' }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(confirmSpy.mock.calls[0][0]).toMatch(/อีกฝั่งจะไม่ถูกลบ/);
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(alertSpy.mock.calls[0][0]).toMatch(/อย่าลืมไปลบอีกฝั่ง/);
    expect(__tables.transactions.map(t => t.id)).toEqual(['old-in']);
  });

  it('an ordinary row keeps the plain confirm and deletes alone', async () => {
    __tables.transactions.push(
      { id: 'plain', user_id: 'user-1', scope: 'personal', title: 'ค่ากาแฟ',
        amount: -65, category: 'อาหาร', type: 'food',
        occurred_at: `${THIS}-03T12:00:00+07:00` },
    );
    render(<FinanceView scope="personal" />);
    await openTab('รายการ');

    await screen.findAllByText('ค่ากาแฟ');
    fireEvent.click(screen.getByRole('button', { name: 'ลบ' }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledWith('ลบรายการนี้?'));
    await waitFor(() => expect(__tables.transactions).toHaveLength(0));
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('B8 · a finished loan says so and can be filed away', () => {

  const DONE = {
    id: 'debt-done', name: 'โมนี่ 1', type: 'loan', monthly_payment: 19253,
    due_day: 5, start_date: '2025-08-01', total_months: 12, months_paid: 12,
    remaining_balance: 0, scope: 'personal', is_active: true,
  };
  const FUTURE = {
    id: 'debt-future', name: 'สินเชื่อใหม่', type: 'loan', monthly_payment: 5000,
    due_day: 5, start_date: `${NEXT}-01`, total_months: 12, months_paid: 0,
    scope: 'personal', is_active: true,
  };

  it('12/12 reads ผ่อนหมดแล้ว, never เกินกำหนด, and leaves the burden', () => {
    render(<DebtTracker debts={[DONE]} payments={[]} yearMonth={THIS} scope="personal" onChange={() => {}} />);

    expect(screen.getByText('ผ่อนหมดแล้ว')).toBeTruthy();
    // "เกินกำหนด" survives only as the stat-tile LABEL — never as this row's
    // badge. (The tile itself reads 0.)
    expect(screen.getAllByText('เกินกำหนด')).toHaveLength(1);
    expect(screen.getByText('เกินกำหนด').parentElement.textContent).toMatch(/^เกินกำหนด0฿0$/);
    expect(screen.queryByRole('button', { name: /บันทึกว่าจ่ายแล้ว/ })).toBeNull();
    // ภาระต่อเดือน is ฿0 and the header says one loan is done.
    expect(document.body.textContent).toMatch(/ภาระต่อเดือน ฿0/);
    expect(document.body.textContent).toMatch(/ผ่อนหมดแล้ว 1 รายการ/);
  });

  it('the archive affordance hides it without deleting the history', async () => {
    __tables.debts.push({ ...DONE });
    __tables.debt_payments.push({ id: 'pay-1', user_id: 'user-1', debt_id: 'debt-done',
      pay_month: '2026-07-01', amount_paid: 19253 });
    const onChange = vi.fn();
    render(<DebtTracker debts={[DONE]} payments={[]} yearMonth={THIS} scope="personal" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /เก็บเข้าคลัง/ }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(__tables.debts.find(d => d.id === 'debt-done').is_active).toBe(false);
    expect(__tables.debt_payments).toHaveLength(1);   // history intact
  });

  it('a loan that has not started reads ยังไม่เริ่ม, not เกินกำหนด', () => {
    render(<DebtTracker debts={[FUTURE]} payments={[]} yearMonth={THIS} scope="personal" onChange={() => {}} />);

    expect(screen.getByText('ยังไม่เริ่ม')).toBeTruthy();
    expect(screen.getAllByText('เกินกำหนด')).toHaveLength(1);   // the stat tile label only
    expect(screen.getByText('เกินกำหนด').parentElement.textContent).toMatch(/^เกินกำหนด0฿0$/);
    expect(document.body.textContent).toMatch(/ยังไม่เริ่ม 1 รายการ/);
  });
});

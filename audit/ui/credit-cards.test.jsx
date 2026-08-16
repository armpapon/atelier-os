// Mounted acceptance for the บัตรเครดิต tab (v4.36).
//
// The arithmetic is pinned in audit/cases.mjs § G. What only a MOUNTED
// component can prove is the rest of the promise: that the tab survives a
// database where migration_add_credit_cards.sql has not been run, that the
// centred add-form actually reaches the table, and that the two states the
// owner reads at a glance — the fee-waiver counter and a cancelled card —
// render the way the approved mockup says they do.
//
// Like every other test in this folder, src/lib/supabase.js is aliased to
// audit/mock-supabase.mjs by audit/ui/vitest.config.mjs, so the REAL
// src/lib/api/creditCards.js runs against a mock PostgREST. Deleting the
// `credit_cards` key from __tables is exactly production before the SQL.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

import { CreditCards } from '../../src/components/dashboard/CreditCards.jsx';
import { __tables } from '../mock-supabase.mjs';

const card = (over = {}) => ({
  id: 'card-' + Math.random().toString(36).slice(2, 8),
  user_id: 'user-1', scope: 'personal',
  name: 'บัตรทดสอบ', issuer: null, network: null,
  status: 'active', pays_full: true,
  credit_limit: null, manual_balance: null, debt_id: null,
  statement_day: null, due_day: null, opened_note: null,
  waiver_mode: 'none', waiver_target: null, waiver_progress: 0,
  waiver_period_note: null, annual_fee: null, annual_fee_note: null,
  fee_profile: {}, installments: [], sort_order: 0,
  ...over,
});

beforeEach(() => {
  cleanup();
  __tables.credit_cards = [];
  vi.stubGlobal('matchMedia', (query) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }));
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
});

describe('บัตรเครดิต · the SQL has not been run yet', () => {
  it('shows the calm setup notice instead of crashing', async () => {
    const saved = __tables.credit_cards;
    delete __tables.credit_cards;                 // exactly production before the migration
    try {
      render(<CreditCards scope="personal" debts={[]} />);
      expect(await screen.findByText(/ยังไม่ได้ติดตั้งตาราง credit_cards/)).toBeTruthy();
      expect(document.body.textContent).toContain('migration_add_credit_cards.sql');
      expect(document.body.textContent).toContain('หน้าอื่นในแอปใช้งานได้ตามปกติ');
      // No add CTA that would only produce another error.
      expect(screen.queryByRole('button', { name: '+ เพิ่มบัตร' })).toBeNull();
    } finally {
      __tables.credit_cards = saved || [];
    }
  });
});

describe('บัตรเครดิต · nothing added yet', () => {
  it('renders the empty state with an add CTA, and no summary strip', async () => {
    render(<CreditCards scope="personal" debts={[]} />);
    expect(await screen.findByText('ยังไม่มีบัตรในระบบ')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ เพิ่มบัตร' })).toBeTruthy();
    // Four zeroed stat tiles would be noise, not information.
    expect(screen.queryByText('ใช้วงเงินรวม (Bureau)')).toBeNull();
  });
});

describe('บัตรเครดิต · adding a card', () => {
  it('opens a centred modal and writes the typed card to the table', async () => {
    render(<CreditCards scope="personal" debts={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: '+ เพิ่มบัตร' }));

    const dialog = await screen.findByRole('dialog', { name: 'เพิ่มบัตร' });
    expect(dialog).toBeTruthy();

    fireEvent.change(screen.getByLabelText('ชื่อบัตร'),        { target: { value: 'KBank PLUSTINUM' } });
    fireEvent.change(screen.getByLabelText('ผู้ออกบัตร'),      { target: { value: 'KBank' } });
    fireEvent.change(screen.getByLabelText('วงเงิน (฿)'),      { target: { value: '300000' } });
    fireEvent.change(screen.getByLabelText('ยอดคงค้าง (฿)'),   { target: { value: '6540' } });
    fireEvent.change(screen.getByLabelText('วันสรุปยอด'),      { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('วันครบกำหนดจ่าย'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('นับแบบไหน'),       { target: { value: 'count' } });
    fireEvent.change(screen.getByLabelText('เป้า'),            { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('ทำไปแล้ว'),        { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มบัตร' }));

    await waitFor(() => expect(__tables.credit_cards).toHaveLength(1));
    const saved = __tables.credit_cards[0];
    expect(saved.name).toBe('KBank PLUSTINUM');
    expect(saved.scope).toBe('personal');
    expect(saved.user_id).toBe('user-1');
    expect(saved.credit_limit).toBe(300000);
    expect(saved.manual_balance).toBe(6540);
    expect(saved.statement_day).toBe(25);
    expect(saved.waiver_mode).toBe('count');
    expect(saved.waiver_target).toBe(12);
    expect(saved.waiver_progress).toBe(2);

    // …and the grid reloads with the card on it, numbers separated.
    expect(await screen.findByText('KBank PLUSTINUM')).toBeTruthy();
    expect(document.body.textContent).toContain('6,540 / 300,000฿');
    // The modal is gone, not left hanging behind the grid.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('บัตรเครดิต · the fee-waiver counter', () => {
  it('renders 2/12 ครั้ง with what is left to swipe', async () => {
    __tables.credit_cards = [card({
      name: 'KBank PLUSTINUM', issuer: 'KBank',
      credit_limit: 300000, manual_balance: 6540,
      waiver_mode: 'count', waiver_target: 12, waiver_progress: 2,
      annual_fee: 1250, waiver_period_note: 'รอบปีบัตร ส.ค. 69 – ก.ค. 70',
    })];

    render(<CreditCards scope="personal" debts={[]} />);
    expect(await screen.findByText('2/12 ครั้ง')).toBeTruthy();
    expect(document.body.textContent).toContain('10 ครั้ง');       // remaining
    expect(document.body.textContent).toContain('฿1,250');          // the fee at stake
    expect(document.body.textContent).toContain('รอบปีบัตร ส.ค. 69 – ก.ค. 70');
    // The summary strip counts it as one card to watch.
    expect(screen.getByText('ค่าธรรมเนียมเฝ้าระวัง')).toBeTruthy();
  });

  it('says ฟรี ไม่มีเงื่อนไข when there is nothing to chase', async () => {
    __tables.credit_cards = [card({ name: 'KTC VISA PLATINUM', waiver_mode: 'none' })];
    render(<CreditCards scope="personal" debts={[]} />);
    expect(await screen.findByText('ฟรี ไม่มีเงื่อนไข ✓')).toBeTruthy();
  });
});

describe('บัตรเครดิต · a cancelled card', () => {
  it('still shows, at the bottom of the grid, chipped ยกเลิกแล้ว', async () => {
    __tables.credit_cards = [
      card({ name: 'ใบที่ยกเลิกแล้ว', status: 'cancelled', sort_order: 0 }),
      card({ name: 'ใบที่ยังใช้อยู่',  status: 'active',    sort_order: 5 }),
    ];

    render(<CreditCards scope="personal" debts={[]} />);
    expect(await screen.findByText('ยกเลิกแล้ว')).toBeTruthy();

    // Active first even though the cancelled card sorts earlier by sort_order.
    const names = Array.from(document.body.querySelectorAll('div'))
      .map(n => n.textContent)
      .filter(t => t === 'ใบที่ยังใช้อยู่' || t === 'ใบที่ยกเลิกแล้ว');
    expect(names[0]).toBe('ใบที่ยังใช้อยู่');
    expect(names[names.length - 1]).toBe('ใบที่ยกเลิกแล้ว');
  });
});

describe('บัตรเครดิต · a card linked to a debt', () => {
  it('reads its balance from the debts the page already loaded', async () => {
    __tables.credit_cards = [card({
      name: 'KTC วิศวจุฬา', pays_full: false,
      credit_limit: 65000, manual_balance: 999, debt_id: 'debt-ktc',
    })];
    const debts = [{ id: 'debt-ktc', name: 'KTC MC', remaining_balance: 50674 }];

    render(<CreditCards scope="personal" debts={debts} />);
    expect(await screen.findByText('KTC วิศวจุฬา')).toBeTruthy();
    // 50,674 (the debt) — never 999 (the stale typed figure).
    expect(document.body.textContent).toContain('50,674 / 65,000฿');
    expect(document.body.textContent).not.toContain('999 / 65,000฿');
    expect(document.body.textContent).toContain('ยังกินดอก');
    expect(document.body.textContent).toContain('~฿676');           // 16%/12
  });
});

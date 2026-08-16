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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import React from 'react';

import { CreditCards } from '../../src/components/dashboard/CreditCards.jsx';
import { __tables } from '../mock-supabase.mjs';

// v4.40 · A2 — three of the claims below are about the WINDOW between clicking
// บันทึก and the write settling, which the mock PostgREST answers too fast to
// observe. `gate.pending`, when set, holds createCreditCard open until the test
// resolves or rejects it by hand; when it is null (every other test in this
// file) the real API runs untouched.
const gate = vi.hoisted(() => ({ pending: null }));
vi.mock('../../src/lib/api/creditCards.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    createCreditCard: async (payload) => {
      if (gate.pending) await gate.pending;
      return real.createCreditCard(payload);
    },
  };
});

/** A promise the test decides the fate of, plus its settle handles. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const card = (over = {}) => ({
  id: 'card-' + Math.random().toString(36).slice(2, 8),
  user_id: 'user-1', scope: 'personal',
  name: 'บัตรทดสอบ', issuer: null, network: null, face_url: null,
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
  gate.pending = null;
});

afterEach(() => { gate.pending = null; });

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

// ════════════════════════════════════════════════════════════════════════════
//  v4.40 · A2 follow-ups. The pure rule is pinned in audit/cases.mjs
//  (safeHttpUrl); what only the mounted card can prove is that the rule is
//  actually applied on the way IN (the form) and on the way OUT (the anchor).
// ════════════════════════════════════════════════════════════════════════════
describe('บัตรเครดิต · ลิงก์ ธปท. ที่เป็นพิษ', () => {
  it('renders no anchor at all for a javascript: url already in the row', async () => {
    __tables.credit_cards = [card({
      name: 'ใบที่ลิงก์เป็นพิษ',
      fee_profile: { interest: '16% ต่อปี', bot_url: 'javascript:alert(1)' },
    })];

    const { container } = render(<CreditCards scope="personal" debts={[]} />);
    expect(await screen.findByText('ใบที่ลิงก์เป็นพิษ')).toBeTruthy();

    // The fee table still renders — only the poisoned link is refused.
    expect(container.textContent).toContain('16% ต่อปี');
    expect(container.querySelector('a')).toBeNull();
    expect(container.innerHTML).not.toContain('javascript:alert(1)');
    expect(screen.queryByRole('link', { name: /ธปท/ })).toBeNull();
  });

  it('still links a real https ธปท. url', async () => {
    __tables.credit_cards = [card({
      name: 'ใบที่ลิงก์ปกติ',
      fee_profile: { bot_url: 'https://app.bot.or.th/fee', bot_checked: '16 ส.ค. 69' },
    })];

    const { container } = render(<CreditCards scope="personal" debts={[]} />);
    expect(await screen.findByText('ใบที่ลิงก์ปกติ')).toBeTruthy();
    const link = container.querySelector('a');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('https://app.bot.or.th/fee');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('drops a javascript: url on save instead of writing it to the row', async () => {
    render(<CreditCards scope="personal" debts={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: '+ เพิ่มบัตร' }));

    fireEvent.change(screen.getByLabelText('ชื่อบัตร'), { target: { value: 'บัตรลิงก์พิษ' } });
    fireEvent.change(screen.getByLabelText('ลิงก์ตาราง ธปท.'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.change(screen.getByLabelText('ตรวจกับ ธปท. เมื่อ'), { target: { value: '16 ส.ค. 69' } });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มบัตร' }));

    await waitFor(() => expect(__tables.credit_cards).toHaveLength(1));
    const saved = __tables.credit_cards[0];
    expect(saved.fee_profile.bot_url).toBeUndefined();      // never stored
    expect(saved.fee_profile.bot_checked).toBe('16 ส.ค. 69'); // the rest is kept
    expect(JSON.stringify(saved)).not.toContain('javascript:');
  });

  it('keeps an https url typed into the same field', async () => {
    render(<CreditCards scope="personal" debts={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: '+ เพิ่มบัตร' }));

    fireEvent.change(screen.getByLabelText('ชื่อบัตร'), { target: { value: 'บัตรลิงก์ดี' } });
    fireEvent.change(screen.getByLabelText('ลิงก์ตาราง ธปท.'), { target: { value: 'https://app.bot.or.th/fee' } });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มบัตร' }));

    await waitFor(() => expect(__tables.credit_cards).toHaveLength(1));
    expect(__tables.credit_cards[0].fee_profile.bot_url).toBe('https://app.bot.or.th/fee');
  });
});

describe('บัตรเครดิต · ระหว่างกำลังบันทึก ป๊อปอัปต้องไม่ปิดตัวเอง', () => {
  /** Open the add form and start a save that will not settle on its own. */
  async function startHangingSave() {
    const d = deferred();
    gate.pending = d.promise;
    render(<CreditCards scope="personal" debts={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: '+ เพิ่มบัตร' }));
    fireEvent.change(screen.getByLabelText('ชื่อบัตร'), { target: { value: 'บัตรที่เซฟช้า' } });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มบัตร' }));
    // The button says so out loud, which is how we know the write is in flight.
    await screen.findByRole('button', { name: 'กำลังบันทึก…' });
    return d;
  }

  it('ignores Esc, the backdrop, ปิด and ยกเลิก until the write settles', async () => {
    const d = await startHangingSave();
    const dialog = screen.getByRole('dialog', { name: 'เพิ่มบัตร' });

    // Both exits are visibly dead, not merely inert.
    expect(screen.getByRole('button', { name: 'ปิด' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'ยกเลิก' }).disabled).toBe(true);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBe(dialog);

    fireEvent.click(dialog.parentElement.firstChild);            // the backdrop
    expect(screen.getByRole('dialog')).toBe(dialog);

    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.getByRole('dialog')).toBe(dialog);

    // Settling lets it behave normally again — and the card really was written.
    await act(async () => { d.resolve(); await d.promise; });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(__tables.credit_cards).toHaveLength(1);
    expect(__tables.credit_cards[0].name).toBe('บัตรที่เซฟช้า');
  });

  it('a rejected write reports itself in the still-mounted form', async () => {
    const d = await startHangingSave();

    await act(async () => {
      d.reject(new Error('เขียนไม่ผ่าน RLS'));
      await d.promise.catch(() => {});
    });

    // The form is still there — which is the only place the error can be read.
    expect(screen.getByRole('dialog', { name: 'เพิ่มบัตร' })).toBeTruthy();
    expect(await screen.findByText('เขียนไม่ผ่าน RLS')).toBeTruthy();
    expect(screen.getByLabelText('ชื่อบัตร').value).toBe('บัตรที่เซฟช้า');   // nothing retyped
    expect(__tables.credit_cards).toHaveLength(0);

    // …and the exits work again, so the owner is not trapped.
    expect(screen.getByRole('button', { name: 'ยกเลิก' }).disabled).toBe(false);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('บัตรเครดิต · ป๊อปอัปกับคีย์บอร์ด', () => {
  const focusablesIn = (dialog) => Array.from(dialog.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));

  it('is a modal dialog whose Tab order cycles inside itself', async () => {
    __tables.credit_cards = [card({ name: 'บัตรทดสอบ' })];
    render(<CreditCards scope="personal" debts={[]} />);

    const opener = await screen.findByRole('button', { name: 'แก้ไข บัตรทดสอบ' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole('dialog', { name: 'แก้ไขบัตร' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const nodes = focusablesIn(dialog);
    expect(nodes.length).toBeGreaterThan(2);
    const first = nodes[0], last = nodes[nodes.length - 1];

    // Tab off the end comes back to the top…
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    // …and Shift+Tab off the top goes to the bottom.
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    // Focus that has escaped the popup entirely is pulled back in.
    document.body.focus();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('hands focus back to the button that opened it', async () => {
    __tables.credit_cards = [card({ name: 'บัตรทดสอบ' })];
    render(<CreditCards scope="personal" debts={[]} />);

    const opener = await screen.findByRole('button', { name: 'แก้ไข บัตรทดสอบ' });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole('dialog', { name: 'แก้ไขบัตร' });
    expect(document.activeElement).not.toBe(opener);          // focus moved into the form

    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
    expect(document.activeElement).not.toBe(document.body);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  v4.41 · หน้าบัตรจริง. The rule itself is pinned in audit/cases.mjs
//  (safeFaceUrl); what only the mounted card can prove is that the picture
//  REPLACES the monogram, that a poisoned value falls back to it rather than
//  reaching <img src>, and that the form stores what the grid will accept.
// ════════════════════════════════════════════════════════════════════════════
describe('บัตรเครดิต · รูปหน้าบัตร', () => {
  it('draws the real face instead of the monogram when the row has one', async () => {
    __tables.credit_cards = [card({
      name: 'KBank PLUSTINUM', issuer: 'KBank',
      face_url: '/cards/kbank-plustinum.png',
    })];

    const { container } = render(<CreditCards scope="personal" debts={[]} />);
    expect(await screen.findByText('KBank PLUSTINUM')).toBeTruthy();

    // Decorative image — not in the accessibility tree, so query the DOM
    // directly rather than getByRole('img'). The name sits right next to it
    // as visible text, which is why alt is empty (A5 · redundant alt).
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('/cards/kbank-plustinum.png');
    // …and the coloured monogram is gone, not merely hidden behind it.
    expect(container.textContent).not.toContain('KBANK');
  });

  it('marks the face image decorative and lazy (A5 follow-up)', async () => {
    __tables.credit_cards = [card({
      name: 'KBank PLUSTINUM', issuer: 'KBank',
      face_url: '/cards/kbank-plustinum.png',
    })];

    const { container } = render(<CreditCards scope="personal" debts={[]} />);
    expect(await screen.findByText('KBank PLUSTINUM')).toBeTruthy();

    const img = container.querySelector('img');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
  });

  it('falls back to the monogram when the face image fails to load (A5 follow-up)', async () => {
    __tables.credit_cards = [card({
      name: 'KBank PLUSTINUM', issuer: 'KBank',
      face_url: '/cards/kbank-plustinum.png',
    })];

    const { container } = render(<CreditCards scope="personal" debts={[]} />);
    expect(await screen.findByText('KBank PLUSTINUM')).toBeTruthy();

    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    fireEvent.error(img);

    // The broken <img> is gone and the coloured monogram takes its place.
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('KBANK')).toBeTruthy();
  });

  it('keeps the monogram for a card with no face image', async () => {
    __tables.credit_cards = [card({ name: 'บัตรไม่มีรูป', issuer: 'KTC' })];

    const { container } = render(<CreditCards scope="personal" debts={[]} />);
    expect(await screen.findByText('บัตรไม่มีรูป')).toBeTruthy();
    expect(screen.getByText('KTC')).toBeTruthy();          // the monogram box
    expect(container.querySelector('img')).toBeNull();
  });

  it('dims a cancelled card WITH its face — the whole block carries the opacity', async () => {
    __tables.credit_cards = [card({
      name: 'ใบที่ยกเลิกแต่มีรูป', status: 'cancelled',
      face_url: '/cards/ktc-visa-platinum.png',
    })];

    const { container } = render(<CreditCards scope="personal" debts={[]} />);
    expect(await screen.findByText('ใบที่ยกเลิกแต่มีรูป')).toBeTruthy();
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('/cards/ktc-visa-platinum.png');
    // The image itself is NOT special-cased; the muted block it sits in is.
    expect(img.style.opacity).toBe('');
    const block = img.closest('[style*="opacity"]');
    expect(block).toBeTruthy();
    expect(block.style.opacity).toBe('0.62');
    expect(block.contains(img)).toBe(true);
  });

  it('falls back to the monogram for a poisoned face_url, drawing no img at all', async () => {
    __tables.credit_cards = [
      card({ name: 'ใบรูปเป็นพิษ', issuer: 'KTC', face_url: 'javascript:alert(1)' }),
      card({ name: 'ใบรูปข้ามโฮสต์', issuer: 'KTC', face_url: '//evil.com/x.png', sort_order: 1 }),
    ];

    const { container } = render(<CreditCards scope="personal" debts={[]} />);
    expect(await screen.findByText('ใบรูปเป็นพิษ')).toBeTruthy();
    expect(screen.getByText('ใบรูปข้ามโฮสต์')).toBeTruthy();

    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('javascript:alert(1)');
    expect(container.innerHTML).not.toContain('//evil.com/x.png');
    expect(container.querySelectorAll('img').length).toBe(0);
    // Both cards still identify themselves the old way.
    expect(container.textContent).toContain('KTC');
  });

  it('saves a typed app path and nulls an unsafe one', async () => {
    render(<CreditCards scope="personal" debts={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: '+ เพิ่มบัตร' }));
    fireEvent.change(screen.getByLabelText('ชื่อบัตร'), { target: { value: 'บัตรรูปดี' } });
    fireEvent.change(screen.getByLabelText('รูปหน้าบัตร (path หรือ https URL)'),
      { target: { value: '/cards/ktc-chula.png' } });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มบัตร' }));

    await waitFor(() => expect(__tables.credit_cards).toHaveLength(1));
    expect(__tables.credit_cards[0].face_url).toBe('/cards/ktc-chula.png');

    // …and the same field refuses a protocol-relative host on the way in.
    cleanup();
    __tables.credit_cards = [];
    render(<CreditCards scope="personal" debts={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: '+ เพิ่มบัตร' }));
    fireEvent.change(screen.getByLabelText('ชื่อบัตร'), { target: { value: 'บัตรรูปพิษ' } });
    fireEvent.change(screen.getByLabelText('รูปหน้าบัตร (path หรือ https URL)'),
      { target: { value: '//evil.com/x.png' } });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มบัตร' }));

    await waitFor(() => expect(__tables.credit_cards).toHaveLength(1));
    expect(__tables.credit_cards[0].face_url).toBeNull();
    expect(JSON.stringify(__tables.credit_cards[0])).not.toContain('evil.com');
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

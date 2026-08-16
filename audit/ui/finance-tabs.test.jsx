// Mounted acceptance for the Finance sub-tab state machine (v4.35 → v4.37).
//
// Answers the independent audit of the six-tab split (DLG-FIN-001 · A1), which
// found the tab machinery itself untested. Proven here and nowhere else:
//   · the six rooms exist, in order, with ภาพรวม open on arrival — in BOTH scopes
//   · ArrowLeft / ArrowRight / Home / End move the selection and the focus
//   · B1 — clicking an account in บัญชี takes the user to รายการ with a chip
//     that names the filter and clears it without leaving the room
//   · B2 — a half-typed debt form survives a trip to another tab and back
//   · A1 — the เงินรั่ว → หนี้ jump hands the keyboard to the debt anchor
//   · A2 — every tab's aria-controls resolves to a real tabpanel, in every state
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import React from 'react';

import { FinanceView, DEBT_TRACKER_ANCHOR } from '../../src/pages/Finance.jsx';
import { currentYearMonth } from '../../src/lib/api/finance.js';
import { __tables, __config } from '../mock-supabase.mjs';

const THIS = currentYearMonth();
const TAB_LABELS = ['ภาพรวม', 'รายการ', 'บัตรเครดิต', 'หนี้', 'งบ & เป้าหมาย', 'บัญชี'];
const PANEL_IDS  = ['fin-panel-overview', 'fin-panel-txns', 'fin-panel-cards',
  'fin-panel-debt', 'fin-panel-budget', 'fin-panel-accounts'];

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

const tabs     = () => screen.getAllByRole('tab');
const tabNamed = (name) => screen.getByRole('tab', { name });
const openTab  = async (name) => fireEvent.click(await screen.findByRole('tab', { name }));
const panelOf  = (id) => document.getElementById(id);
const isShown  = (el) => !el.hasAttribute('hidden') && el.style.display !== 'none';
const selected = () => tabs().find(t => t.getAttribute('aria-selected') === 'true');

/** Two accounts, three transactions this month — two of them on KBank. */
function seedAccounts(scope = 'personal') {
  __tables.accounts.push(
    { id: 'acc-k', user_id: 'user-1', name: 'KBank ออมทรัพย์', type: 'savings',
      scope, balance: 12000, is_active: true, tone: 'amber' },
    { id: 'acc-s', user_id: 'user-1', name: 'SCB กระแสฯ', type: 'savings',
      scope, balance: 4000, is_active: true, tone: 'profit' },
  );
  __tables.transactions.push(
    { id: 'tx-k1', user_id: 'user-1', scope, account_id: 'acc-k', title: 'ค่ากาแฟ',
      amount: -65, category: 'อาหาร', type: 'food', occurred_at: `${THIS}-04T12:00:00+07:00` },
    { id: 'tx-k2', user_id: 'user-1', scope, account_id: 'acc-k', title: 'ค่าไฟ',
      amount: -1200, category: 'บิล', type: 'bills', occurred_at: `${THIS}-05T12:00:00+07:00` },
    { id: 'tx-s1', user_id: 'user-1', scope, account_id: 'acc-s', title: 'เงินเดือน',
      amount: 50000, category: 'รายรับ', type: 'income', occurred_at: `${THIS}-01T12:00:00+07:00` },
  );
}

/** A debt whose remaining interest is > 0, so เงินรั่ว grows its debt row. */
function seedDebt(scope = 'personal') {
  __tables.debts.push({
    id: 'debt-1', user_id: 'user-1', name: 'บ้าน', type: 'loan', monthly_payment: 10000,
    due_day: 5, total_months: 24, months_paid: 0, interest_rate: 4.1,
    original_principal: 200000, remaining_balance: 200000, scope, is_active: true,
  });
}

// ════════════════════════════════════════════════════════════════════════════
describe('Finance sub-tabs · หกห้อง หนึ่งหน้า', () => {

  it('renders the six tabs in order and opens on ภาพรวม', async () => {
    seedAccounts();
    render(<FinanceView scope="personal" />);

    await waitFor(() => expect(tabs()).toHaveLength(6));
    expect(tabs().map(t => t.textContent)).toEqual(TAB_LABELS);
    expect(tabNamed('ภาพรวม').getAttribute('aria-selected')).toBe('true');
    expect(tabs().filter(t => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);

    // Roving tabIndex: only the selected tab is in the document's tab order.
    expect(tabs().map(t => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1', '-1']);

    // All six panels are mounted (B2/A2) — exactly one of them is on screen.
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(6);
    const shown = PANEL_IDS.filter(id => isShown(panelOf(id)));
    expect(shown).toEqual(['fin-panel-overview']);
    // …and the hidden five are out of the accessibility tree, so a role query
    // — the way assistive tech reads the page — sees only the open room.
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel').id).toBe('fin-panel-overview');
  });

  it('renders the same six tabs on the family scope', async () => {
    seedAccounts('family');
    render(<FinanceView scope="family" />);

    await waitFor(() => expect(tabs()).toHaveLength(6));
    expect(tabs().map(t => t.textContent)).toEqual(TAB_LABELS);
    expect(tabNamed('ภาพรวม').getAttribute('aria-selected')).toBe('true');
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(6);

    // The room a family user is most likely to want still opens.
    await openTab('บัญชี');
    expect(tabNamed('บัญชี').getAttribute('aria-selected')).toBe('true');
    expect(await within(panelOf('fin-panel-accounts')).findByText('KBank ออมทรัพย์')).toBeTruthy();
  });

  it('moves the selection with ArrowRight / ArrowLeft / Home / End', async () => {
    render(<FinanceView scope="personal" />);
    await waitFor(() => expect(tabs()).toHaveLength(6));

    const press = (key) => fireEvent.keyDown(selected(), { key });

    press('ArrowRight');
    expect(selected().textContent).toBe('รายการ');
    expect(document.activeElement).toBe(tabNamed('รายการ'));   // focus follows selection
    expect(isShown(panelOf('fin-panel-txns'))).toBe(true);
    expect(isShown(panelOf('fin-panel-overview'))).toBe(false);

    press('End');
    expect(selected().textContent).toBe('บัญชี');
    expect(document.activeElement).toBe(tabNamed('บัญชี'));

    press('ArrowRight');                                        // wraps past the end
    expect(selected().textContent).toBe('ภาพรวม');

    press('ArrowLeft');                                         // wraps before the start
    expect(selected().textContent).toBe('บัญชี');

    press('Home');
    expect(selected().textContent).toBe('ภาพรวม');
    expect(document.activeElement).toBe(tabNamed('ภาพรวม'));
    expect(tabs().filter(t => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });

  it('keeps every aria-controls pointing at a real panel, in every tab state (A2)', async () => {
    render(<FinanceView scope="personal" />);
    await waitFor(() => expect(tabs()).toHaveLength(6));

    for (const label of TAB_LABELS) {
      await openTab(label);
      for (const t of tabs()) {
        const target = document.getElementById(t.getAttribute('aria-controls'));
        expect(target).toBeTruthy();                              // never a dangling id
        expect(target.getAttribute('role')).toBe('tabpanel');
        expect(target.getAttribute('aria-labelledby')).toBe(t.id);
      }
      // The selected tab is the one whose panel is on screen — and only it.
      const open = PANEL_IDS.filter(id => isShown(panelOf(id)));
      expect(open).toHaveLength(1);
      expect(open[0]).toBe(tabNamed(label).getAttribute('aria-controls'));
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('B1 · เลือกบัญชีแล้วต้องเห็นรายการของบัญชีนั้นทันที', () => {

  it('takes the user to รายการ with a chip that names the filter, and clears it there', async () => {
    seedAccounts();
    render(<FinanceView scope="personal" />);

    await openTab('บัญชี');
    const accountsPanel = panelOf('fin-panel-accounts');
    const txnsPanel     = panelOf('fin-panel-txns');
    fireEvent.click(await within(accountsPanel).findByText('KBank ออมทรัพย์'));

    // 1 · the result is where the user now is.
    expect(tabNamed('รายการ').getAttribute('aria-selected')).toBe('true');
    expect(isShown(txnsPanel)).toBe(true);
    expect(isShown(accountsPanel)).toBe(false);

    // 2 · the list really is filtered — 2 of the 3 rows are KBank's.
    expect(txnsPanel.querySelectorAll('[data-txn-row]')).toHaveLength(2);
    expect(txnsPanel.textContent).toContain('ค่ากาแฟ');
    expect(txnsPanel.textContent).not.toContain('เงินเดือน');
    expect(within(txnsPanel).getByText(/^2 รายการ ·/)).toBeTruthy();

    // 3 · a chip says which account, right by the card header.
    const chip = txnsPanel.querySelector('[data-account-filter-chip]');
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain('บัญชี: KBank ออมทรัพย์');

    // 4 · ✕ clears the filter without leaving the room.
    fireEvent.click(within(chip).getByRole('button', { name: 'ล้างตัวกรองบัญชี' }));
    expect(txnsPanel.querySelector('[data-account-filter-chip]')).toBeNull();
    expect(txnsPanel.querySelectorAll('[data-txn-row]')).toHaveLength(3);
    expect(txnsPanel.textContent).toContain('เงินเดือน');
    expect(tabNamed('รายการ').getAttribute('aria-selected')).toBe('true');

    // 5 · and the บัญชี room agrees — nothing is highlighted any more.
    await openTab('บัญชี');
    expect(within(accountsPanel).queryByRole('button', { name: /ล้าง filter/ })).toBeNull();
  });

  it('clicking the already-selected account clears the filter and stays in บัญชี', async () => {
    seedAccounts();
    render(<FinanceView scope="personal" />);

    await openTab('บัญชี');
    const accountsPanel = panelOf('fin-panel-accounts');
    fireEvent.click(await within(accountsPanel).findByText('KBank ออมทรัพย์'));
    expect(tabNamed('รายการ').getAttribute('aria-selected')).toBe('true');

    await openTab('บัญชี');
    fireEvent.click(within(accountsPanel).getByText('KBank ออมทรัพย์'));
    expect(tabNamed('บัญชี').getAttribute('aria-selected')).toBe('true');
    expect(panelOf('fin-panel-txns').querySelector('[data-account-filter-chip]')).toBeNull();
    expect(panelOf('fin-panel-txns').querySelectorAll('[data-txn-row]')).toHaveLength(3);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('B2 · ร่างที่ยังไม่บันทึกต้องไม่หายเมื่อสลับแท็บ', () => {

  it('keeps a half-typed debt form across a trip to ภาพรวม and back', async () => {
    seedAccounts();
    render(<FinanceView scope="personal" />);

    await openTab('หนี้');
    const debtPanel = panelOf('fin-panel-debt');
    fireEvent.click(await within(debtPanel).findByRole('button', { name: '+ เพิ่ม' }));

    const nameInput = within(debtPanel).getByPlaceholderText(/BMW Leasing/);
    fireEvent.change(nameInput, { target: { value: 'สินเชื่อบ้าน SCB' } });
    const monthly = within(debtPanel).getByPlaceholderText('19253');
    fireEvent.change(monthly, { target: { value: '19253' } });

    // An accidental tab change — the draft must not be thrown away.
    await openTab('ภาพรวม');
    expect(isShown(debtPanel)).toBe(false);
    expect(within(debtPanel).queryByRole('button', { name: '+ เพิ่ม' })).toBeNull();   // hidden from AT

    await openTab('หนี้');
    expect(isShown(debtPanel)).toBe(true);
    expect(within(debtPanel).getByPlaceholderText(/BMW Leasing/).value).toBe('สินเชื่อบ้าน SCB');
    expect(within(debtPanel).getByPlaceholderText('19253').value).toBe('19253');
    // …and it is the SAME input element — the panel was never remounted.
    expect(within(debtPanel).getByPlaceholderText(/BMW Leasing/)).toBe(nameInput);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('A1 · กระโดดจากเงินรั่วไปหนี้แล้วคีย์บอร์ดต้องตามไปด้วย', () => {

  it('moves focus onto the debt anchor, not back to <body>', async () => {
    seedAccounts();
    seedDebt();
    const { container } = render(<FinanceView scope="personal" />);

    const debtRow = await waitFor(() => {
      const el = container.querySelector('[data-leak-row="debt"]');
      expect(el).toBeTruthy();
      return el;
    });

    debtRow.focus();
    expect(document.activeElement).toBe(debtRow);
    fireEvent.click(debtRow);

    const anchor = document.getElementById(DEBT_TRACKER_ANCHOR);
    expect(anchor.getAttribute('tabindex')).toBe('-1');
    await waitFor(() => expect(document.activeElement).toBe(anchor));
    expect(document.activeElement).not.toBe(document.body);
    expect(tabNamed('หนี้').getAttribute('aria-selected')).toBe('true');
    expect(isShown(panelOf('fin-panel-debt'))).toBe(true);
  });
});

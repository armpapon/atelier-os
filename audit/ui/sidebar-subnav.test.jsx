// Mounted acceptance for the sidebar finance sub-navigation (v4.38).
//
// The owner's call: "คิดว่าเอา sub มาอยู่ซ้ายดีไหม แบบกดที่ การเงินส่วนตัวแล้ว
// ค่อยย่อยลงมา" and then "ok เลย แต่ถ้ามีด้านข้าง ไม่ต้องด้านบนก็ได้ครับ
// ไม่ต้องซ้ำซ้อน". So on a DESKTOP width the six finance rooms are reachable
// from the sidebar and the in-page tab bar is gone; on a MOBILE width — where
// the sidebar itself is not rendered — the tab bar is still the whole
// navigation, with the v4.37 tablist semantics untouched.
//
// The whole App shell is mounted (preview mode bypasses the login gate), so
// what is proven here is the real wiring: App owns the per-scope tab, the
// sidebar reads it, and a jump made INSIDE the page comes back out to the
// sidebar highlight.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import React from 'react';

import App from '../../src/App.jsx';
import { FINANCE_TABS } from '../../src/lib/financeTabs.js';
import { currentYearMonth } from '../../src/lib/api/finance.js';
import { __tables, __config } from '../mock-supabase.mjs';

const THIS = currentYearMonth();
const TAB_LABELS = FINANCE_TABS.map(t => t.label);   // ภาพรวม · รายการ · บัตรเครดิต · หนี้ · งบ & เป้าหมาย · บัญชี

/**
 * The app-wide breakpoint is MOBILE_QUERY = '(max-width: 1023px)'. jsdom has no
 * real matchMedia, so each test says out loud which side of it it is on:
 *   viewport(false) → DESKTOP — sidebar rendered, no in-page tab bar
 *   viewport(true)  → MOBILE  — MobileNav + the in-page tab bar
 * There is deliberately no third state: the same query drives both.
 */
const viewport = (isMobile) => vi.stubGlobal('matchMedia', (query) => ({
  matches: isMobile, media: query, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
}));

/** ?preview=1 — App skips the login gate and shows every page in the menu. */
const previewUrl = (search = '?preview=1') =>
  window.history.replaceState({}, '', '/' + search);

const subOf     = (page, tab) => document.querySelector(`[data-sub-page="${page}"][data-sub-tab="${tab}"]`);
const subsOf    = (page) => Array.from(document.querySelectorAll(`[data-sub-page="${page}"]`));
const subLabels = (page) => subsOf(page).map(b => b.textContent);
const openSubs  = (page) => document.getElementById(`nav-subs-${page}`);
const isFolded  = (page) => openSubs(page).getAttribute('aria-hidden') === 'true';
const header    = (name) => screen.getByRole('button', { name });
const panel     = (id) => document.getElementById(`fin-panel-${id}`);
const isShown   = (el) => !!el && !el.hasAttribute('hidden') && el.style.display !== 'none';
const currentSub = (page) => subsOf(page).filter(b => b.getAttribute('aria-current') === 'page')
  .map(b => b.getAttribute('data-sub-tab'));

function seedAccounts(scope = 'personal') {
  __tables.accounts.push(
    { id: 'acc-k', user_id: 'user-1', name: 'KBank ออมทรัพย์', type: 'savings',
      scope, balance: 12000, is_active: true, tone: 'amber' },
  );
  __tables.transactions.push(
    { id: 'tx-k1', user_id: 'user-1', scope, account_id: 'acc-k', title: 'ค่ากาแฟ',
      amount: -65, category: 'อาหาร', type: 'food', occurred_at: `${THIS}-04T12:00:00+07:00` },
  );
}

beforeEach(() => {
  cleanup();
  for (const k of Object.keys(__tables)) __tables[k] = [];
  __config.rpcHandlers = {};
  __config.missingColumns = {};
  __config.opFailures = {};
  __config.opFailurePredicate = null;
  window.localStorage.clear();          // 'atelier:active' must not leak between tests
  previewUrl();
  viewport(false);                      // desktop unless a test says otherwise
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => { window.localStorage.clear(); });

/** Mount the shell and wait for the sidebar to exist. */
async function mountApp() {
  const view = render(<App />);
  await screen.findByRole('button', { name: 'การเงินส่วนตัว' });
  return view;
}

// ════════════════════════════════════════════════════════════════════════════
describe('Sidebar · กดการเงินส่วนตัวแล้วเมนูย่อยกางลงมา', () => {

  it('opens the six rooms under การเงินส่วนตัว, in the same order as the tabs', async () => {
    await mountApp();

    // On the dashboard both groups are folded away — and folded means folded:
    // out of the accessibility tree, so a role query cannot reach the rooms.
    expect(isFolded('personal-finance')).toBe(true);
    expect(isFolded('family-finance')).toBe(true);
    expect(screen.queryByRole('button', { name: 'บัตรเครดิต' })).toBeNull();

    fireEvent.click(header('การเงินส่วนตัว'));

    expect(isFolded('personal-finance')).toBe(false);
    expect(subLabels('personal-finance')).toEqual(TAB_LABELS);
    expect(subsOf('personal-finance').every(b => b.getAttribute('tabindex') === '0')).toBe(true);
    // …and every room is now reachable by name.
    for (const label of TAB_LABELS) expect(screen.getByRole('button', { name: label })).toBeTruthy();

    // The header also went to the page, opening on the default room.
    expect(header('การเงินส่วนตัว').getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(isShown(panel('overview'))).toBe(true));
    expect(currentSub('personal-finance')).toEqual(['overview']);
  });

  it('clicking a sub navigates to the page AND opens that room', async () => {
    seedAccounts();
    await mountApp();

    fireEvent.click(header('การเงินส่วนตัว'));
    fireEvent.click(subOf('personal-finance', 'cards'));

    await waitFor(() => expect(isShown(panel('cards'))).toBe(true));
    // exactly one room on screen, and it is the one the sidebar points at
    const shown = FINANCE_TABS.map(t => t.id).filter(id => isShown(panel(id)));
    expect(shown).toEqual(['cards']);
    expect(currentSub('personal-finance')).toEqual(['cards']);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);

    // Jumping straight to another room from the sidebar moves the page with it.
    fireEvent.click(subOf('personal-finance', 'accounts'));
    await waitFor(() => expect(isShown(panel('accounts'))).toBe(true));
    expect(isShown(panel('cards'))).toBe(false);
    expect(currentSub('personal-finance')).toEqual(['accounts']);
    expect(await within(panel('accounts')).findByText('KBank ออมทรัพย์')).toBeTruthy();
  });

  it('expanding การเงินครอบครัว collapses การเงินส่วนตัว — one group at a time', async () => {
    await mountApp();

    fireEvent.click(header('การเงินส่วนตัว'));
    expect(isFolded('personal-finance')).toBe(false);
    expect(isFolded('family-finance')).toBe(true);

    fireEvent.click(header('การเงินครอบครัว'));
    expect(isFolded('family-finance')).toBe(false);
    expect(isFolded('personal-finance')).toBe(true);
    expect(header('การเงินส่วนตัว').getAttribute('aria-expanded')).toBe('false');
    // The folded group's buttons are out of the tab order too.
    expect(subsOf('personal-finance').every(b => b.getAttribute('tabindex') === '-1')).toBe(true);

    // Clicking the header of the page you are already on folds it back up
    // without sending you anywhere else.
    fireEvent.click(header('การเงินครอบครัว'));
    expect(isFolded('family-finance')).toBe(true);
    await waitFor(() => expect(isShown(panel('overview'))).toBe(true));

    // Leaving finance altogether folds both groups away again.
    fireEvent.click(header('แดชบอร์ด'));
    expect(isFolded('personal-finance')).toBe(true);
    expect(isFolded('family-finance')).toBe(true);
  });

  it('follows a jump made inside the page — บัญชี → รายการ lights up in the sidebar', async () => {
    seedAccounts();
    await mountApp();

    fireEvent.click(header('การเงินส่วนตัว'));
    fireEvent.click(subOf('personal-finance', 'accounts'));
    await waitFor(() => expect(isShown(panel('accounts'))).toBe(true));
    expect(currentSub('personal-finance')).toEqual(['accounts']);

    // B1's in-page jump: clicking an account takes the user to รายการ. The
    // sidebar has to agree — it is the only navigation on this screen.
    fireEvent.click(await within(panel('accounts')).findByText('KBank ออมทรัพย์'));
    await waitFor(() => expect(isShown(panel('txns'))).toBe(true));
    expect(currentSub('personal-finance')).toEqual(['txns']);
    expect(panel('txns').querySelector('[data-account-filter-chip]')).toBeTruthy();
  });

  it('keeps a room per scope, and re-enters each page where it was left', async () => {
    seedAccounts();
    seedAccounts('family');
    await mountApp();

    fireEvent.click(header('การเงินส่วนตัว'));
    fireEvent.click(subOf('personal-finance', 'debt'));
    await waitFor(() => expect(isShown(panel('debt'))).toBe(true));

    // The other scope is untouched — it opens on ภาพรวม, not on หนี้.
    fireEvent.click(header('การเงินครอบครัว'));
    await waitFor(() => expect(isShown(panel('overview'))).toBe(true));
    expect(currentSub('family-finance')).toEqual(['overview']);
    expect(currentSub('personal-finance')).toEqual([]);        // not the current page

    // Coming back to the personal page lands in the room it was left in.
    fireEvent.click(header('การเงินส่วนตัว'));
    await waitFor(() => expect(isShown(panel('debt'))).toBe(true));
    expect(currentSub('personal-finance')).toEqual(['debt']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('หนึ่งจอ หนึ่งเมนู — ไม่ซ้ำซ้อน', () => {

  it('desktop: the finance page has NO in-page tab bar', async () => {
    seedAccounts();
    await mountApp();

    fireEvent.click(header('การเงินส่วนตัว'));
    await waitFor(() => expect(isShown(panel('overview'))).toBe(true));

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    // The rooms themselves are all still there, with the same ids and the same
    // one-open rule — only the control changed.
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(6);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    // …and the sidebar is the navigation that IS on screen.
    expect(document.querySelector('.sidebar')).toBeTruthy();
    expect(subLabels('personal-finance')).toEqual(TAB_LABELS);
  });

  it('mobile: the tab bar is back, and the sidebar is the one that is gone', async () => {
    seedAccounts();
    viewport(true);
    window.localStorage.setItem('atelier:active', 'personal-finance');

    render(<App />);

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual(TAB_LABELS);
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(tabs.find(t => t.getAttribute('aria-selected') === 'true').textContent).toBe('ภาพรวม');

    // No sidebar, so no sub-navigation in it — never both, never neither.
    expect(document.querySelector('.sidebar')).toBeNull();
    expect(subsOf('personal-finance')).toHaveLength(0);

    // The tablist still behaves exactly as v4.37 audited it.
    fireEvent.click(screen.getByRole('tab', { name: 'บัตรเครดิต' }));
    expect(screen.getByRole('tab', { name: 'บัตรเครดิต' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(isShown(panel('cards'))).toBe(true));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'บัตรเครดิต' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'หนี้' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'หนี้' }));
  });
});

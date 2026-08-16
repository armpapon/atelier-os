/**
 * financeTabs — the six rooms of the Finance page, in one place (v4.38).
 *
 * Two navigations render this same list and MUST NOT drift:
 *   · Sidebar.jsx  — the desktop accordion under การเงินส่วนตัว / การเงินครอบครัว
 *   · Finance.jsx  — the in-page segmented tablist, which since v4.38 renders
 *                    on mobile only (the sidebar is hidden there)
 * The ids are also the suffix of every `fin-tab-*` / `fin-panel-*` DOM id, so
 * renaming one here renames the aria wiring on both sides at once.
 */
export const FINANCE_TABS = [
  { id: 'overview', label: 'ภาพรวม' },
  { id: 'txns',     label: 'รายการ' },
  { id: 'cards',    label: 'บัตรเครดิต' },
  { id: 'debt',     label: 'หนี้' },
  { id: 'budget',   label: 'งบ & เป้าหมาย' },
  { id: 'accounts', label: 'บัญชี' },
];

/** Every finance page opens on ภาพรวม. Nothing about the tab is persisted. */
export const DEFAULT_FINANCE_TAB = 'overview';

/**
 * Page id → finance scope. 'finance' is the pre-v4.0 id App.jsx still routes to
 * PersonalFinance, so it shares the personal scope's tab slot instead of
 * silently getting its own.
 */
export const FINANCE_PAGE_SCOPE = {
  'personal-finance': 'personal',
  'family-finance':   'family',
  'finance':          'personal',
};

/** The scope a page id belongs to, or null when the page is not a finance page. */
export function financeScopeOf(pageId) {
  return FINANCE_PAGE_SCOPE[pageId] || null;
}

/** Fresh per-scope tab map — both scopes start on the default room. */
export function initialFinanceTabs() {
  return { personal: DEFAULT_FINANCE_TAB, family: DEFAULT_FINANCE_TAB };
}

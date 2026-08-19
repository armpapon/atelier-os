import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Icon } from '../components/Icon.jsx';
import { CSVImporter } from '../components/CSVImporter.jsx';
import { toneColor } from '../lib/helpers.js';
import {
  listTransactions, listTransactionsRange, createTransaction, updateTransaction,
  updateTransactionMaybePaired, deleteTransactionWithPair, getTransferPair,
  listAccounts, createAccount, updateAccount,
  reassignAndArchiveAccount, setAccountBalanceAnchor, loadEffectiveBalances,
  listBudgets, listGoals, createGoal, deleteGoal,
  summarize, aggregateByMonth, aggregateByCategory, aggregateByDay, topExpenses,
  previousMonth, lastNMonths, getMonthBounds, currentYearMonth,
  deleteTransactionsInMonth, financeMonthSummary,
  listDebts, listDebtPayments,
  listRecurring, forecastCashFlow, computeEmergencyFundCoverage,
  monthlyRecurringTotal,
  bangkokDate, bangkokTime, isTransfer,
} from '../lib/api/finance.js';
import { cashflowWindow, cashflowSeries, filterToMonths } from '../lib/cashflow.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { useMediaQuery, MOBILE_QUERY } from '../lib/useMediaQuery.js';
import { FINANCE_TABS, DEFAULT_FINANCE_TAB } from '../lib/financeTabs.js';
import { MonthNav, formatThaiMonth } from '../components/dashboard/MonthNav.jsx';
import { CashFlowChart } from '../components/dashboard/CashFlowChart.jsx';
import { CategoryBreakdown, TopExpenses, BudgetProgress, NetWorthCard, DailyHeatmap } from '../components/dashboard/Charts.jsx';
import { DebtTracker } from '../components/dashboard/DebtTracker.jsx';
import { DebtAdvice } from '../components/dashboard/DebtAdvice.jsx';
import { MoneyPlanner } from '../components/dashboard/MoneyPlanner.jsx';
import { CreditCards } from '../components/dashboard/CreditCards.jsx';
import { RecurringTracker, CashFlowForecastCard, EmergencyFundCard } from '../components/dashboard/FinanceWidgets.jsx';
import { ScopeTransferModal } from '../components/dashboard/ScopeTransferModal.jsx';
import { MoneyLeaks } from '../components/dashboard/MoneyLeaks.jsx';
import { Button, Card, CardHeader, Badge, EmptyState } from '../components/ui/index.js';
import { todayStr } from '../lib/dates.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: 'food',      label: 'อาหาร',    icon: '🍜', type: 'food' },
  { id: 'transport', label: 'เดินทาง',  icon: '🚗', type: 'transport' },
  { id: 'bills',     label: 'บิล',      icon: '💡', type: 'bills' },
  { id: 'income',    label: 'รายรับ',   icon: '💰', type: 'income' },
  { id: 'shop',      label: 'ช้อปปิ้ง', icon: '🛍', type: 'shop' },
  { id: 'family',    label: 'ครอบครัว', icon: '❤️', type: 'family' },
  { id: 'other',     label: 'อื่น ๆ',   icon: '📦', type: 'other' },
];
const CUSTOM_CATS_KEY = 'loop:custom-categories';
// The เงินรั่ว card's debt row is a link, not a drill-down: the detail behind
// "ดอกเบี้ยหนี้ที่ยังต้องจ่าย" is a set of loans, and the Debt Tracker on this
// same page already renders them properly. Jump there instead of duplicating it.
export const DEBT_TRACKER_ANCHOR = 'loop-debt-tracker';

function loadCustomCats() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_CATS_KEY) || '[]'); }
  catch { return []; }
}
function saveCustomCats(arr) {
  localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(arr));
}
function slugify(label) {
  return (label || '').toLowerCase().trim()
    .replace(/[^a-z0-9ก-๙\s_-]/g, '')
    .replace(/\s+/g, '_') || ('cat_' + Date.now());
}

const SCOPE_META = {
  personal: { label: 'ส่วนตัว',  accent: 'var(--accent)',  sub: 'รายรับ-รายจ่ายส่วนตัว · บัญชี Make · เป้าหมาย' },
  family:   { label: 'ครอบครัว', accent: 'var(--violet)',  sub: 'รายจ่ายครอบครัว · บัญชีร่วม · กองทุน & งบประมาณ' },
};

function txDate(iso, compact = false) {
  if (!iso) return '';
  // Bangkok calendar date, not device-local — display and the inline edit
  // value must agree even when the device clock is on another timezone.
  const ymd = bangkokDate(iso);   // 'YYYY-MM-DD'
  // Narrow screens get 30/7 instead of "30 ก.ค." so the category beside it
  // doesn't get truncated down to two characters.
  if (compact) return `${Number(ymd.substring(8, 10))}/${Number(ymd.substring(5, 7))}`;
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
}

/** Preserve the row's Bangkok wall-clock when only the date is edited. */
function withBangkokTime(dateYMD, originalTs) {
  const time = bangkokTime(originalTs) || '12:00:00';
  return `${dateYMD}T${time}+07:00`;
}

/** The sign invariant: income rows are positive, everything else negative. */
const isIncomeTxn = (t) => t?.type === 'income' || t?.category === 'รายรับ';

// ════════════════════════════════════════════════════════════════════════════
//  Transaction Form Drawer (add + edit)
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
//  Inline-edit cells — click any cell to edit, Enter/blur to save, Esc to cancel
// ════════════════════════════════════════════════════════════════════════════
function InlineEdit({ value, onSave, type = 'text', display, placeholder, cellStyle, inputStyle, hint = 'คลิกเพื่อแก้ไข' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value ?? '');
  useEffect(() => { setDraft(value ?? ''); }, [value]);

  const save = async () => {
    setEditing(false);
    // An emptied number field used to save as ฿0 without a word. Clearing a
    // number is never an instruction to zero it — just cancel.
    if (type === 'number' && String(draft).trim() === '') { setDraft(value ?? ''); return; }
    const next = type === 'number' ? Number(draft)
              : (typeof draft === 'string' ? draft.trim() : draft);
    if (type === 'number' && !Number.isFinite(next)) { setDraft(value ?? ''); return; }
    if (next === value || (next === '' && !value) || (next === null && !value)) return;
    try { await onSave(next); }
    catch (e) { alert(e.message); setDraft(value ?? ''); }
  };

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); }
        }}
        placeholder={placeholder}
        style={{
          width: '100%', background: 'var(--fill)',
          border: 'none', borderRadius: 8,
          padding: '3px 6px', fontSize: 13, color: 'var(--text-primary)',
          fontFamily: 'inherit', outline: 'none',
          boxShadow: '0 0 0 2px var(--accent)', ...inputStyle,
        }}
      />
    );
  }
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <div
      onClick={() => setEditing(true)} title={hint}
      style={{
        cursor: 'text', padding: '3px 6px', borderRadius: 8,
        transition: 'background 150ms',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontStyle: isEmpty ? 'italic' : 'normal',
        color: isEmpty ? 'var(--text-muted)' : undefined,
        ...cellStyle,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--fill)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {display ?? (isEmpty ? (placeholder || '—') : value)}
    </div>
  );
}

function InlineSelect({ value, options, onSave, onAdd, cellStyle }) {
  const [editing, setEditing] = useState(false);

  const handleAdd = async () => {
    setEditing(false);
    const label = window.prompt('ชื่อหมวดใหม่ (เช่น "ค่าเรียน", "เกม"):');
    if (!label || !label.trim()) return;
    const icon = (window.prompt('Emoji ของหมวดนี้ (เช่น 🎮 📚 ☕️):') || '📦').trim();
    const id   = slugify(label);
    const cat  = { id, label: label.trim(), icon, type: id };
    try {
      await onAdd?.(cat);
      await onSave(id);
    } catch (err) {
      if (String(err.message || '').includes('transactions_type_check')) {
        alert(
          'หมวดใหม่บันทึกไม่ได้ — DB ยังมี constraint เก่าอยู่\n\n' +
          'แก้: ไป Supabase SQL Editor รัน 1 บรรทัด:\n\n' +
          'ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;'
        );
      } else {
        alert(err.message);
      }
    }
  };

  if (editing) {
    return (
      <select
        autoFocus
        value={value}
        onChange={async e => {
          const next = e.target.value;
          if (next === '__add__') { await handleAdd(); return; }
          setEditing(false);
          if (next === value) return;
          try { await onSave(next); } catch (err) { alert(err.message); }
        }}
        onBlur={() => setEditing(false)}
        style={{
          width: '100%', background: 'var(--fill)',
          border: 'none', borderRadius: 8,
          padding: '2px 5px', fontSize: 13, color: 'var(--text-primary)',
          fontFamily: 'inherit', outline: 'none',
          boxShadow: '0 0 0 2px var(--accent)',
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.icon ? o.icon + ' ' : ''}{o.label}</option>
        ))}
        {onAdd && (
          <>
            <option disabled>──────────</option>
            <option value="__add__">+ เพิ่มหมวดใหม่...</option>
          </>
        )}
      </select>
    );
  }
  const cur = options.find(o => o.value === value);
  return (
    <div
      onClick={() => setEditing(true)} title="คลิกเพื่อเปลี่ยนหมวด"
      style={{
        cursor: 'pointer', padding: '3px 6px', borderRadius: 8,
        transition: 'background 150ms',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontSize: 13, color: 'var(--text-secondary)', ...cellStyle,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--fill)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {cur?.icon} {cur?.label || value}
    </div>
  );
}

function TxnForm({ accounts, scope, initialTxn, onSave, onClose, categories = DEFAULT_CATEGORIES, onAddCategory }) {
  const isEdit = !!initialTxn;
  const formRef     = useRef(null);
  const firstInputRef = useRef(null);
  const [form, setForm] = useState(() => {
    if (initialTxn) {
      const amt = Math.abs(Number(initialTxn.amount));
      return {
        title:       initialTxn.title || '',
        amount:      String(amt || ''),
        type:        initialTxn.type || 'food',
        account_id:  initialTxn.account_id || '',
        note:        initialTxn.note || '',
        // Bangkok calendar date — split('T')[0] on the stored UTC string
        // opened "1 ก.ค." as 30 มิ.ย. and every re-save walked the date back.
        occurred_at: bangkokDate(initialTxn.occurred_at) || todayStr(),
      };
    }
    return {
      title: '', amount: '', type: 'food', account_id: accounts[0]?.id || '',
      note: '', occurred_at: todayStr(),
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isIncome = form.type === 'income';
  // Transfer legs are sign- and category-locked: editing the title/note/date
  // of a scope transfer must never turn it into income/expense (that would
  // corrupt P&L on BOTH scopes).
  const isTransferEdit = isEdit && isTransfer(initialTxn);

  // Popup is now only used for + เพิ่มใหม่ or ⋯ full edit.
  // Auto-focus first input + close on Esc.
  useEffect(() => {
    requestAnimationFrame(() => {
      firstInputRef.current?.focus({ preventScroll: true });
    });
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.amount) return;
    setSaving(true); setError(null);
    try {
      // Sign rule (audit round 2):
      //  - NEW rows: sign follows the picked type (income ⇒ +, else −).
      //  - EDITS where the user did NOT change the type: preserve the row's
      //    original sign — a note edit on a positive non-'income' row (e.g.
      //    a CSV credit or a transfer +leg) must not flip it negative.
      //  - EDITS with an explicit type change: sign follows the new type.
      //  - Transfer rows: sign, type and category are locked to the original.
      const abs = Math.abs(Number(form.amount));
      const typeChanged = isEdit && form.type !== initialTxn.type;
      let amount;
      if (isTransferEdit) {
        // Amount is LOCKED for transfer legs (the field is read-only below):
        // the two legs must stay mirrored, and this popup only sees one leg.
        amount = Number(initialTxn.amount);
      } else if (isEdit && !typeChanged) {
        amount = abs * (Number(initialTxn.amount) < 0 ? -1 : 1);
      } else {
        amount = abs * (isIncome ? 1 : -1);
      }
      const fullPayload = {
        title: form.title.trim(), amount,
        // Never rewrite 'โอนภายใน' → 'transfer': the transfer category/type
        // pair is preserved verbatim on transfer rows.
        type:     isTransferEdit ? initialTxn.type     : form.type,
        category: isTransferEdit ? initialTxn.category
                 : (categories.find(c => c.id === form.type)?.label || form.type),
        account_id: form.account_id || null,
        note: form.note.trim() || null,
        // Pin the Bangkok offset. A bare 'YYYY-MM-DD' is read by Postgres as
        // UTC midnight; edits keep the row's original Bangkok wall-clock.
        occurred_at: isEdit
          ? withBangkokTime(form.occurred_at, initialTxn.occurred_at)
          : `${form.occurred_at}T12:00:00+07:00`,
        scope,
      };
      // Batch C · B5: editing a transfer leg touches only the fields that
      // describe the transfer as a whole — and those are written to BOTH legs
      // so the pair cannot drift apart. Everything else on a transfer row is
      // already locked to its original value above.
      const payload = isTransferEdit
        ? { title: fullPayload.title, occurred_at: fullPayload.occurred_at, note: fullPayload.note }
        : fullPayload;
      if (isEdit) await updateTransactionMaybePaired(initialTxn, payload);
      else        await createTransaction(payload);
      onSave(); onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  // ── Anchor-based positioning ──────────────────────────────────────────────
  // Rule:
  //   Popup vertical center = clicked ROW vertical center (clamp to viewport).
  //   Popup horizontal center = clicked ROW horizontal center (clamp to viewport).
  // Anchor is the row's bounding rect (not just the ⋯ button) — so the popup
  // sits over the table area, not over the sidebar.
  const POPUP_W = 460, POPUP_H_EST = 480, MARGIN = 14;
  const anchor  = initialTxn?._anchorRect;
  const popupPos = (() => {
    if (!anchor) return null;
    const vw = window.innerWidth, vh = window.innerHeight;

    const rowMidY = (anchor.top  + anchor.bottom) / 2;
    const rowMidX = (anchor.left + anchor.right)  / 2;

    let top  = rowMidY - POPUP_H_EST / 2;
    top  = Math.max(MARGIN, Math.min(top,  vh - POPUP_H_EST - MARGIN));

    let left = rowMidX - POPUP_W / 2;
    left = Math.max(MARGIN, Math.min(left, vw - POPUP_W - MARGIN));

    const maxH = Math.min(POPUP_H_EST + 80, vh - top - MARGIN);
    return { top, left, maxH };
  })();

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      display: popupPos ? 'block' : 'flex',
      alignItems: 'center', justifyContent: 'center',
      padding: popupPos ? 0 : 20, animation: 'fadeIn 120ms ease-out',
    }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'var(--dim)',
        backdropFilter: popupPos ? 'none' : 'blur(2px)',
      }} />
      <form ref={formRef} onSubmit={handleSubmit} style={{
        position: popupPos ? 'absolute' : 'relative',
        top:   popupPos ? popupPos.top  : undefined,
        left:  popupPos ? popupPos.left : undefined,
        width: POPUP_W, maxWidth: 'calc(100vw - 28px)',
        maxHeight: popupPos ? popupPos.maxH : '88vh',
        background: 'var(--surface)', border: 'none',
        borderRadius: 'var(--radius-card)', padding: 22,
        overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: 'var(--shadow-pop)',
        animation: 'popIn 160ms cubic-bezier(.2,.9,.3,1.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>
            {isEdit ? '✎ แก้ไขรายการ' : 'บันทึกรายการ'}
          </div>
          <button type="button" onClick={onClose} style={{ color: 'var(--text-secondary)', fontSize: 18, background: 'none', border: 0, cursor: 'pointer', width: 28, height: 28, borderRadius: '50%' }}>×</button>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>ประเภท</div>
          {isTransferEdit ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 'var(--radius-btn)',
              background: 'var(--fill)', color: 'var(--text-secondary)',
              fontSize: 12.5, fontWeight: 500,
            }}>
              🔒 โอนภายใน — เปลี่ยนประเภท/เครื่องหมายไม่ได้ (กันยอดสอง scope เพี้ยน)
            </div>
          ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {categories.map(c => (
              <button key={c.id} type="button" onClick={() => set('type', c.id)}
                style={{ padding: '6px 12px', borderRadius: 'var(--radius-btn)', fontSize: 12.5, fontWeight: 500, background: form.type === c.id ? 'var(--accent)' : 'var(--fill)', color: form.type === c.id ? 'var(--text-inverse)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>
                {c.icon} {c.label}
              </button>
            ))}
            {onAddCategory && (
              <button type="button"
                onClick={async () => {
                  const label = window.prompt('ชื่อหมวดใหม่:');
                  if (!label || !label.trim()) return;
                  const icon  = (window.prompt('Emoji (เช่น 🎮 📚 ☕️):') || '📦').trim();
                  const id    = slugify(label);
                  const cat   = { id, label: label.trim(), icon, type: id };
                  await onAddCategory(cat);
                  set('type', id);
                }}
                style={{ padding: '6px 12px', borderRadius: 'var(--radius-btn)', fontSize: 12.5, fontWeight: 500, background: 'transparent', color: 'var(--text-secondary)', border: '1px dashed var(--hairline)', cursor: 'pointer' }}>
                + เพิ่มหมวด
              </button>
            )}
          </div>
          )}
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>รายการ</span>
          <input ref={firstInputRef} className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="เช่น ข้าวกลางวัน, ค่าน้ำมัน" required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            จำนวน (บาท) {isTransferEdit
              ? (Number(initialTxn.amount) < 0 ? '— โอนออก (-)' : '— รับโอน (+)')
              : (isIncome ? '— รายรับ (+)' : '— รายจ่าย (-)')}
          </span>
          {isTransferEdit ? (
            // Amount LOCKED for transfer legs — editing one side alone would
            // desync the mirrored pair (+90,000 / −80,000).
            <div
              title="แก้ยอดโอนไม่ได้ — ลบแล้วโอนใหม่แทน เพื่อให้สองฝั่งตรงกันเสมอ"
              style={{
                padding: '9px 12px', borderRadius: 'var(--radius-field)',
                background: 'var(--fill)', color: 'var(--text-muted)',
                fontSize: 14, fontVariantNumeric: 'tabular-nums', cursor: 'not-allowed',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
              <span>฿{Math.abs(Number(initialTxn.amount)).toLocaleString('th', { maximumFractionDigits: 2 })}</span>
              <span style={{ fontSize: 11 }}>🔒 ล็อกให้สองฝั่งตรงกัน</span>
            </div>
          ) : (
            <input className="input" type="number" min="0" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" required />
          )}
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>วันที่</span>
          <input className="input" type="date" value={form.occurred_at} onChange={e => set('occurred_at', e.target.value)} />
        </label>
        {accounts.length > 0 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>บัญชี</span>
            <select className="input" value={form.account_id} onChange={e => set('account_id', e.target.value)}>
              <option value="">ไม่ระบุ</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>โน้ต</span>
          <input className="input" value={form.note} onChange={e => set('note', e.target.value)} placeholder="หมายเหตุเพิ่มเติม" />
        </label>
        {error && <div style={{ padding: '10px 12px', background: 'var(--danger-soft)', color: 'var(--danger)', border: 'none', borderRadius: 'var(--radius-field)', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
          <Button type="button" variant="outline" onClick={onClose} fullWidth>ยกเลิก</Button>
          <Button type="submit" disabled={saving} variant="primary" fullWidth>{saving ? '...' : (isEdit ? '💾 บันทึกการแก้ไข' : '💾 บันทึก')}</Button>
        </div>
      </form>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Account Modal — create + edit + archive (no hard delete)
// ════════════════════════════════════════════════════════════════════════════
const ACCOUNT_TONES = ['amber', 'profit', 'blue', 'violet', 'rose', 'brass'];

function AccountModal({ scope, initial = null, accounts = [], onSave, onClose }) {
  const isEdit = !!initial;
  // In edit mode the balance field is the ANCHOR value (ยอดจริงตอนนี้), not
  // the derived display balance.
  const initialBalance = isEdit ? (initial._stored_balance ?? initial.balance ?? 0) : '';
  const [form, setForm] = useState({
    name:    initial?.name || '',
    type:    initial?.type || 'savings',
    balance: initialBalance === '' ? '' : String(initialBalance),
    tone:    initial?.tone || 'amber',
  });
  const [reassignTo, setReassignTo] = useState('');
  const [saving, setSaving] = useState(false);
  const otherAccounts = accounts.filter(a => a.id !== initial?.id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await updateAccount(initial.id, { name: form.name, type: form.type, tone: form.tone });
        const newBalance = Number(form.balance);
        if (form.balance !== '' && Number.isFinite(newBalance) && newBalance !== Number(initialBalance)) {
          // Setting a balance stamps the anchor — from now on the displayed
          // balance = this value + ledger transactions after this moment.
          await setAccountBalanceAnchor(initial.id, newBalance);
        }
      } else {
        await createAccount({ name: form.name, type: form.type, balance: Number(form.balance) || 0, tone: form.tone, scope });
      }
      onSave(); onClose();
    }
    catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  const handleArchive = async () => {
    const moveTo = otherAccounts.find(a => a.id === reassignTo);
    const msg = moveTo
      ? `ย้ายรายการทั้งหมดของ "${initial.name}" ไป "${moveTo.name}" แล้วเก็บบัญชีนี้?`
      : `เก็บบัญชี "${initial.name}"?\n(ประวัติรายการยังอยู่ครบ — บัญชีแค่ถูกซ่อนจากรายการ)`;
    if (!confirm(msg)) return;
    setSaving(true);
    try {
      // Batch C · B3: ONE transaction on the server. The old two-request
      // sequence could leave the ledger moved and this account still active
      // and empty; reassignAndArchiveAccount either does both or neither.
      await reassignAndArchiveAccount(initial.id, moveTo?.id || null);
      onSave(); onClose();
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  const labelStyle = { fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
      <form onSubmit={handleSubmit} style={{ position: 'relative', background: 'var(--surface)', border: 'none', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)', padding: 30, width: 360, maxHeight: '88vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>
          {isEdit ? '✎ แก้ไขบัญชี' : 'เพิ่มบัญชี'}
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelStyle}>ชื่อบัญชี</span>
          <input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Make by KBank ออมทรัพย์" required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelStyle}>ประเภท</span>
          <select className="input" value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))}>
            <option value="savings">ออมทรัพย์</option><option value="checking">กระแสรายวัน</option>
            <option value="investment">การลงทุน</option><option value="cash">เงินสด</option>
            <option value="debt">หนี้สิน</option><option value="crypto">คริปโต</option>
          </select>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelStyle}>สี</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {ACCOUNT_TONES.map(t => (
              <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tone: t }))}
                aria-label={`สี ${t}`}
                style={{
                  width: 24, height: 24, borderRadius: '50%', cursor: 'pointer',
                  background: toneColor(t),
                  border: form.tone === t ? '2px solid var(--text-primary)' : '2px solid transparent',
                }} />
            ))}
          </div>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelStyle}>{isEdit ? 'ตั้งยอดปัจจุบัน (บาท)' : 'ยอดเริ่มต้น (บาท)'}</span>
          <input className="input" type="number" step="0.01" value={form.balance} onChange={e => setForm(f => ({...f, balance: e.target.value}))} placeholder="0" />
          {isEdit && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              ใส่ยอดจริง ณ ตอนนี้ — ยอดที่โชว์ = ยอดนี้ + รายการที่ลงวันที่หลังจากนี้
              (รายการย้อนหลังก่อนจุดนี้ไม่กระทบยอด เพราะเงินสะท้อนอยู่ในยอดจริงแล้ว)
            </span>
          )}
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button type="button" variant="outline" onClick={onClose} fullWidth>ยกเลิก</Button>
          <Button type="submit" disabled={saving} variant="primary" fullWidth>{saving ? '...' : (isEdit ? '💾 บันทึก' : '+ เพิ่มบัญชี')}</Button>
        </div>

        {isEdit && (
          <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={labelStyle}>เก็บบัญชี (แทนการลบ)</span>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              บัญชีจะถูกซ่อนจากทุกรายการ แต่ประวัติธุรกรรมยังอยู่ครบ
            </div>
            {otherAccounts.length > 0 && (
              <select className="input" value={reassignTo} onChange={e => setReassignTo(e.target.value)}>
                <option value="">ไม่ย้ายรายการ (เก็บไว้กับบัญชีเดิม)</option>
                {otherAccounts.map(a => (
                  <option key={a.id} value={a.id}>ย้ายรายการทั้งหมดไป → {a.name}</option>
                ))}
              </select>
            )}
            <Button type="button" variant="danger" size="sm" onClick={handleArchive} disabled={saving}>
              🗂 เก็บบัญชีนี้
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Goal Modal
// ════════════════════════════════════════════════════════════════════════════
function GoalModal({ scope, onSave, onClose }) {
  const [form, setForm] = useState({ title: '', target_amount: '', current_amount: '0', deadline: '' });
  const [saving, setSaving] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await createGoal({ title: form.title, target_amount: Number(form.target_amount), current_amount: Number(form.current_amount) || 0, deadline: form.deadline || null, scope }); onSave(); onClose(); }
    catch (err) { alert(err.message); } finally { setSaving(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
      <form onSubmit={handleSubmit} style={{ position: 'relative', background: 'var(--surface)', border: 'none', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)', padding: 30, width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>ตั้งเป้าหมาย</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>ชื่อเป้าหมาย</span>
          <input className="input" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="เงินดาวน์บ้าน, กองทุนฉุกเฉิน" required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>เป้าหมาย (บาท)</span>
          <input className="input" type="number" min="1" value={form.target_amount} onChange={e => setForm(f => ({...f, target_amount: e.target.value}))} placeholder="500000" required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>มีอยู่แล้ว (บาท)</span>
          <input className="input" type="number" min="0" value={form.current_amount} onChange={e => setForm(f => ({...f, current_amount: e.target.value}))} placeholder="0" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>กำหนด (ถ้ามี)</span>
          <input className="input" type="date" value={form.deadline} onChange={e => setForm(f => ({...f, deadline: e.target.value}))} />
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button type="button" variant="outline" onClick={onClose} fullWidth>ยกเลิก</Button>
          <Button type="submit" disabled={saving} variant="primary" fullWidth>{saving ? '...' : 'บันทึก'}</Button>
        </div>
      </form>
    </div>
  );
}

// Centered modal to link a transaction to a recurring bill (marks it paid).
function RecurringLinkMenu({ txn, recurring, onPick, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '20px 20px 28px' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative', width: 420, maxWidth: '100%', maxHeight: '70vh', overflowY: 'auto',
        background: 'var(--surface)', border: 'none', borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-pop)', padding: 22, display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontWeight: 500 }}>นี่คือการจ่ายบิลประจำ?</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-3)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {txn.title}
          </div>
        </div>
        {recurring.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '12px 0', lineHeight: 1.6 }}>
            ยังไม่มีบิลประจำ — ตั้งในการ์ด "บิล / ค่าใช้จ่ายประจำ" ก่อนนะครับ
          </div>
        ) : recurring.map(r => {
          const active = txn.recurring_id === r.id;
          return (
            <button key={r.id} onClick={() => onPick(r.id)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, width: '100%',
                textAlign: 'left', padding: '11px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 14,
                border: 'none',
                background: active ? 'var(--accent-tint)' : 'var(--fill)',
                color: active ? 'var(--accent)' : 'var(--text-primary)',
              }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              {active && <span style={{ flexShrink: 0 }}>✓ ผูกอยู่</span>}
            </button>
          );
        })}
        {txn.recurring_id && (
          <button onClick={() => onPick(null)}
            style={{ width: '100%', textAlign: 'center', padding: '9px', borderRadius: 'var(--radius-btn)', color: 'var(--danger)', fontSize: 12.5, cursor: 'pointer', marginTop: 4, background: 'transparent', border: 'none' }}>
            × ยกเลิกการผูก
          </button>
        )}
        <button onClick={onClose} className="btn btn--ghost" style={{ marginTop: 8 }}>ปิด</button>
      </div>
    </div>
  );
}

// One income/expense line under the hero balance: circled arrow + label + amount.
function FlowLine({ tone, label, amount, sub }) {
  const isIn = tone === 'in';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 500 }}>
      <span style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, lineHeight: 1,
        background: isIn ? 'var(--success-soft)' : 'var(--danger-soft)',
        color: isIn ? 'var(--success)' : 'var(--danger)',
      }}>{isIn ? '↓' : '↑'}</span>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{
        fontWeight: 600, fontVariantNumeric: 'tabular-nums',
        color: isIn ? 'var(--success)' : 'var(--text-primary)',
      }}>
        ฿{Math.abs(Number(amount) || 0).toLocaleString('th', { maximumFractionDigits: 0 })}
      </span>
      {sub && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  );
}

// ── Sub-tabs (v4.35 · lifted in v4.38) ───────────────────────────────────────
// One page, six rooms. Every panel reads the SAME state (yearMonth, txns,
// accounts…) held by FinanceView — switching tabs never reloads data.
// The list itself now lives in src/lib/financeTabs.js because the desktop
// sidebar renders the very same six entries.

/**
 * iOS-style segmented pill bar. Scrolls sideways on a narrow screen.
 * v4.38: rendered on MOBILE ONLY — on desktop the same six rooms are reachable
 * from the sidebar accordion, and the owner asked for one control, not two
 * ("ถ้ามีด้านข้าง ไม่ต้องด้านบนก็ได้ครับ ไม่ต้องซ้ำซ้อน").
 */
function FinanceTabs({ value, onChange }) {
  const move = (e) => {
    const i = FINANCE_TABS.findIndex(t => t.id === value);
    const n = FINANCE_TABS.length;
    let next = null;
    if (e.key === 'ArrowRight') next = (i + 1) % n;
    else if (e.key === 'ArrowLeft') next = (i - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next === null) return;
    e.preventDefault();
    const id = FINANCE_TABS[next].id;
    onChange(id);
    const el = typeof document !== 'undefined' && document.getElementById(`fin-tab-${id}`);
    if (el && typeof el.focus === 'function') el.focus();
  };

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
      <div role="tablist" aria-label="หมวดการเงิน" onKeyDown={move}
        style={{
          display: 'inline-flex', gap: 2, padding: 3,
          background: 'var(--fill)', borderRadius: 999,
        }}>
        {FINANCE_TABS.map(t => {
          const active = t.id === value;
          return (
            <button key={t.id} id={`fin-tab-${t.id}`} role="tab" type="button"
              className="focus-ring"
              aria-selected={active}
              aria-controls={`fin-panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(t.id)}
              style={{
                padding: '7px 14px', borderRadius: 999, border: 0, cursor: 'pointer',
                fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                fontFamily: 'inherit', transition: 'background 150ms, color 150ms',
                background: active ? 'var(--surface)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: active ? 'var(--shadow-card)' : 'none',
              }}>
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Shared wrapper so every panel gets the same stacking + a11y wiring.
 *
 * Every panel stays MOUNTED — inactive ones are hidden, never unmounted
 * (audited: DLG-FIN-001 · B2 + A2). Two things depend on this and both broke
 * when the panels were conditionally rendered:
 *   B2 · a half-typed DebtForm / RecurringForm survives a tab change. Unmounting
 *        threw the draft away with no warning.
 *   A2 · every tab's `aria-controls` points at an element that really exists;
 *        five of six were dangling references while only the active panel was
 *        in the DOM.
 * `hidden` + `display:none` (the inline `display` has to be switched too — it
 * would otherwise override the UA stylesheet's `[hidden] { display:none }`) plus
 * `aria-hidden` keep the inactive rooms out of sight, out of the tab order and
 * out of the accessibility tree. Data is not affected: every panel reads the
 * same state FinanceView already loaded, so nothing refetches on a tab change.
 */
function TabPanel({ id, active, tabbed, children }) {
  // The label comes from the tab button when there IS one (mobile). On desktop
  // the tablist is not rendered, so `aria-labelledby` would point at nothing —
  // name the room directly instead of leaving a dangling reference.
  //
  // The ROLE follows the same rule (audited: DLG-FIN-001 · A3). A tabpanel is
  // half of a tab widget; with the tablist gone on desktop the room is simply a
  // named region, and calling it a tabpanel would promise a tab that is not
  // there. Mobile keeps the full tab/tabpanel pair.
  const label = FINANCE_TABS.find(t => t.id === id)?.label || id;
  return (
    <div role={tabbed ? 'tabpanel' : 'region'} id={`fin-panel-${id}`}
      aria-labelledby={tabbed ? `fin-tab-${id}` : undefined}
      aria-label={tabbed ? undefined : label}
      hidden={!active} aria-hidden={active ? undefined : true}
      style={{ display: active ? 'flex' : 'none', flexDirection: 'column', gap: 18 }}>
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Shared FinanceView — Financial Planner Edition
// ════════════════════════════════════════════════════════════════════════════
/**
 * @param scope        'personal' | 'family'
 * @param tab          optional CONTROLLED sub-tab id. App.jsx passes it so the
 *                     sidebar accordion and this page read one truth.
 * @param onTabChange  optional notifier fired on every room change — including
 *                     the internal jumps (เงินรั่ว → หนี้, บัญชี → รายการ), so
 *                     the sidebar highlight follows them too.
 * Both are optional: with neither prop the page keeps its own state exactly as
 * it did in v4.37, which is what every mounted test and any other caller uses.
 */
export function FinanceView({ scope, tab: tabProp, onTabChange }) {
  const meta = SCOPE_META[scope] || SCOPE_META.personal;
  const isMobile = useMediaQuery(MOBILE_QUERY);

  // Always default to today's month on page open.
  // (User can still navigate to other months via MonthNav during the session
  // — but we no longer persist that across sessions / page reloads.)
  const [yearMonth, setYearMonth] = useState(() => currentYearMonth());
  // Sub-tab (v4.35). Like the month, it goes back to the default room every
  // time the app opens. Nothing is persisted to storage.
  // v4.38: when App.jsx passes `tab`, that value wins and this local copy is
  // only the fallback for callers that render FinanceView on its own.
  const [localTab, setLocalTab] = useState(DEFAULT_FINANCE_TAB);
  const tab = tabProp ?? localTab;
  const setTab = useCallback((id) => {
    setLocalTab(id);
    onTabChange?.(id);
  }, [onTabChange]);
  // Today's month, pinned for the session. The cash-flow chart's 12-month
  // window hangs off THIS, never off `yearMonth` — clicking a bar used to
  // re-anchor the window and slide every later month off the chart.
  const [todayYm] = useState(() => currentYearMonth());
  const [accountFilter, setAccountFilter] = useState(null);   // account_id or null

  const [txns, setTxns]         = useState([]);
  const [prevTxns, setPrevTxns] = useState([]);
  const [trend12, setTrend12]   = useState([]);
  const [monthSummary, setMonthSummary] = useState(null);   // server aggregate (null = RPC not installed)
  const [accounts, setAccounts] = useState([]);
  const [budgets, setBudgets]   = useState([]);
  const [goals, setGoals]       = useState([]);
  const [debts, setDebts]       = useState([]);
  const [debtPayments, setDebtPayments] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  // Partial-load failures (debts/recurring/…): the page stays alive but says
  // so, instead of silently rendering "empty".
  const [loadWarning, setLoadWarning] = useState(null);
  // Audit B4: the post-anchor ledger could not be read, so every anchored
  // balance on screen is a stale anchor — labelled, never passed off as real.
  const [balancesUnconfirmed, setBalancesUnconfirmed] = useState(false);

  const [showTxnForm, setShowTxnForm]   = useState(false);
  const [editingTxn,  setEditingTxn]    = useState(null);
  const [linkingTxn,  setLinkingTxn]    = useState(null);
  const [showAccForm, setShowAccForm]   = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showImporter, setShowImporter] = useState(false);

  // Custom categories (saved in localStorage, merged with defaults)
  // Named "allCategories" to avoid collision with the aggregation `categories` below.
  const [customCats, setCustomCats] = useState(loadCustomCats);
  const allCategories = useMemo(() => [...DEFAULT_CATEGORIES, ...customCats], [customCats]);
  const catIconOf  = useCallback(id => allCategories.find(c => c.id === id)?.icon || '📦', [allCategories]);
  const addCategory = useCallback((cat) => {
    // Dedupe by id; if duplicate, leave existing as-is
    setCustomCats(prev => {
      if (prev.some(c => c.id === cat.id) || DEFAULT_CATEGORIES.some(c => c.id === cat.id)) return prev;
      const next = [...prev, cat];
      saveCustomCats(next);
      return next;
    });
  }, []);
  // Explicit user click only — never fired on load, so the "no auto-scroll"
  // rule (which is about forms moving the page unbidden) is untouched.
  // Since v4.35 the Debt Tracker lives in its own tab, so the jump switches
  // rooms first and scrolls to the anchor once that panel has mounted.
  // Audited (DLG-FIN-001 · A1): the button that fired this jump is in the now
  // hidden ภาพรวม panel, so keyboard focus would fall back to <body> and the
  // user would have to tab from the top of the page again. Move focus onto the
  // debt anchor (tabIndex=-1) BEFORE scrolling, with preventScroll so the focus
  // call itself never fights the smooth scroll.
  const scrollToDebts = useCallback(() => {
    setTab('debt');
    setTimeout(() => {
      const el = typeof document !== 'undefined' && document.getElementById(DEBT_TRACKER_ANCHOR);
      if (!el) return;
      if (typeof el.focus === 'function') el.focus({ preventScroll: true });
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 0);
  }, [setTab]);

  const removeCategory = useCallback((id) => {
    setCustomCats(prev => {
      const next = prev.filter(c => c.id !== id);
      saveCustomCats(next);
      return next;
    });
  }, []);

  // (Removed: localStorage persistence for yearMonth — user wants page
  //  to default to today's month every time it opens, not stick to the
  //  last viewed month.)

  // Month clicks fire overlapping loads; without a sequence number a slow
  // earlier response could land after a fast later one and paint last month's
  // totals under this month's header.
  const reqSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setTxns([]); setPrevTxns([]); setTrend12([]); setAccounts([]); setBudgets([]); setGoals([]);
      setLoading(false);
      return;
    }
    const myReq = ++reqSeq.current;
    setLoading(true); setError(null);
    try {
      const prev = previousMonth(yearMonth);
      // Two windows now, and the fetch has to cover both:
      //  · chartMonths — fixed, ends at THIS month. The chart never moves.
      //  · months12    — the browsed window. Every other history consumer
      //                  (MoneyLeaks / RecurringTracker / forecast / emergency
      //                  fund / debt payments) has always read this one, and
      //                  still does — see `history12` below.
      // They're identical while you're on the current month, which is the
      // default; the union only widens when you browse away.
      const chartMonths = cashflowWindow(todayYm);
      const months12 = lastNMonths(12, yearMonth);
      const rangeFrom = chartMonths[0] < months12[0] ? chartMonths[0] : months12[0];
      const chartLast = chartMonths[chartMonths.length - 1];
      const viewLast  = months12[months12.length - 1];
      const rangeTo   = chartLast > viewLast ? chartLast : viewLast;
      const { startTs: startTrend } = getMonthBounds(rangeFrom);
      const { endTs:   endTrend   } = getMonthBounds(rangeTo);

      // Date range for debt payments — deliberately still the BROWSED window,
      // unchanged from before this batch.
      const { start: paymentStart } = getMonthBounds(months12[0]);
      const { end:   paymentEnd   } = getMonthBounds(months12[months12.length - 1]);

      // Secondary lists must not kill the page, but a failure must be SAID —
      // a swallowed error used to render as "ไม่มีหนี้" with zero burden.
      const failedParts = [];
      const softly = (promise, label) =>
        promise.catch(() => { failedParts.push(label); return []; });

      const [t, p, r12, a, b, g, d, dp, rec, ms] = await Promise.all([
        listTransactions({ yearMonth, scope, limit: 20000 }),
        listTransactions({ yearMonth: prev, scope, limit: 20000 }),
        listTransactionsRange({ startDate: startTrend, endDate: endTrend, scope }),
        listAccounts({ scope }),
        listBudgets(yearMonth, scope),
        listGoals(scope),
        softly(listDebts({ scope }), 'หนี้สิน'),
        softly(listDebtPayments({ startMonth: paymentStart, endMonth: paymentEnd }), 'ประวัติจ่ายหนี้'),
        softly(listRecurring({ scope }), 'บิลประจำ'),
        // Server-side month totals (transfer-excluded, Bangkok) — null when
        // the RPC migration hasn't been run; trendData falls back below.
        financeMonthSummary({ scope, fromYm: rangeFrom, toYm: rangeTo })
          .catch(() => null),
      ]);

      // Displayed balance = anchor + ledger after the anchor (accounts
      // without an anchor keep the stored snapshot).
      //
      // Audit B4: if that overlay fails we must NOT quietly fall back to the
      // raw anchors — they omit every transaction since. The accounts come
      // back flagged and the amber banner below says the numbers are not
      // confirmed.
      const { accounts: aEff, unconfirmed } = await loadEffectiveBalances(a || []);

      if (myReq !== reqSeq.current) return;   // a newer load already won
      setTxns(t || []); setPrevTxns(p || []); setTrend12(r12 || []);
      setMonthSummary(ms);
      setAccounts(aEff); setBalancesUnconfirmed(unconfirmed);
      setBudgets(b || []); setGoals(g || []);
      setDebts(d || []); setDebtPayments(dp || []);
      setRecurring(rec || []);
      setLoadWarning(failedParts.length
        ? `โหลดข้อมูล ${failedParts.join(' / ')} ไม่สำเร็จ — ตัวเลขส่วนนั้นอาจไม่ครบ ลองรีเฟรชอีกครั้ง`
        : null);
    } catch (err) {
      if (myReq !== reqSeq.current) return;
      setError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      if (myReq === reqSeq.current) setLoading(false);
    }
  }, [yearMonth, scope, todayYm]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Delete a transaction — a transfer leg takes its counterpart with it ────
  // Batch C · B5. A grouped pair is deleted in ONE statement after a confirm
  // that names BOTH sides; a legacy leg with no group (the backfill refuses
  // ambiguous matches) is deleted alone and the user is told the other side
  // may need removing by hand — never a silent half-transfer.
  const scopeLabel = (s) => (s === 'family' ? 'ครอบครัว' : 'ส่วนตัว');
  const legLine = (l) => `${scopeLabel(l.scope)}: ${Number(l.amount) < 0 ? '−' : '+'}฿${Math.abs(Number(l.amount)).toLocaleString('th', { maximumFractionDigits: 0 })} · ${l.title}`;
  const handleDeleteTxn = useCallback(async (t) => {
    let message = 'ลบรายการนี้?';
    if (t.transfer_group_id) {
      let legs = [];
      try { legs = await getTransferPair(t.transfer_group_id); } catch { legs = []; }
      const both = (legs.length ? legs : [t])
        .slice().sort((a, b) => Number(a.amount) - Number(b.amount));
      message = 'ลบเงินโอนนี้ทั้งคู่?\n'
        + both.map(legLine).join('\n')
        + '\n\n(ลบข้างเดียวไม่ได้ — จะทำให้ยอดอีก scope เพี้ยน)';
    } else if (isTransfer(t)) {
      message = 'ลบขาโอนนี้?\n'
        + '⚠️ รายการนี้เป็นเงินโอนรุ่นเก่าที่ยังไม่ได้จับคู่ไว้ — อีกฝั่งจะไม่ถูกลบ\n'
        + 'ต้องไปลบเองที่ scope อีกฝั่ง ไม่งั้นยอดจะเพี้ยน';
    }
    if (!confirm(message)) return;
    try {
      const res = await deleteTransactionWithPair(t);
      if (res.orphan) {
        alert('ลบขาโอนนี้แล้ว — อย่าลืมไปลบอีกฝั่งด้วยตัวเอง (รายการโอนรุ่นเก่ายังไม่ได้จับคู่)');
      }
    } catch (err) {
      alert(err.message || 'ลบไม่สำเร็จ');
    }
    refresh();
  }, [refresh]);

  // ── Computed ────────────────────────────────────────────────────────────────
  const thisSum = useMemo(() => summarize(txns),     [txns]);
  const prevSum = useMemo(() => summarize(prevTxns), [prevTxns]);

  const trendData = useMemo(() => {
    // Prefer the SQL aggregate (immune to the PostgREST 1000-row cap);
    // fall back to paginated client aggregation when the RPC isn't installed.
    const agg = monthSummary || aggregateByMonth(trend12);
    // Anchored to TODAY — not to `yearMonth`. This is the whole fix.
    return cashflowSeries(agg, todayYm);
  }, [monthSummary, trend12, todayYm]);

  // The browsed 12-month history. `trend12` now spans the union of the chart
  // window and the browsed window, so every consumer that used to mean "the
  // browsed window" reads this instead — their inputs stay byte-identical to
  // what they were before the chart window was pinned.
  const history12 = useMemo(
    () => filterToMonths(trend12, lastNMonths(12, yearMonth)),
    [trend12, yearMonth],
  );

  const categories = useMemo(() => aggregateByCategory(txns), [txns]);
  const top10      = useMemo(() => topExpenses(txns, 10),      [txns]);
  const dailyMap   = useMemo(() => aggregateByDay(txns, yearMonth), [txns, yearMonth]);

  // Cash Flow Forecast — uses avg of last 3 months for variable expense
  const forecast = useMemo(() => {
    // Same monthlyization the forecast uses — reading r.amount raw counted a
    // yearly bill twelve times over against a monthly average.
    const recurringTotal = monthlyRecurringTotal(recurring);
    const trendAgg = aggregateByMonth(history12).slice(-3);
    const avgIncome   = trendAgg.length ? trendAgg.reduce((s, x) => s + x.income, 0) / trendAgg.length : 0;
    const avgExpense  = trendAgg.length ? trendAgg.reduce((s, x) => s + x.expense, 0) / trendAgg.length : 0;
    const debtTotal   = debts.reduce((s, d) => s + Number(d.monthly_payment || 0), 0);
    // variable = avg expense − recurring − debt (what's left is variable)
    const avgVariable = Math.max(0, avgExpense - recurringTotal - debtTotal);
    return forecastCashFlow({
      monthlyIncome: Math.round(avgIncome),
      recurring, debts,
      avgVariableExpense: Math.round(avgVariable),
      monthsAhead: 3,
    });
  }, [recurring, debts, history12]);

  // Emergency fund coverage
  const emergencyFund = useMemo(() => {
    const trendAgg = aggregateByMonth(history12).slice(-3);
    const avgExpense = trendAgg.length ? trendAgg.reduce((s, x) => s + x.expense, 0) / trendAgg.length : thisSum.expense;
    return computeEmergencyFundCoverage(accounts, avgExpense);
  }, [accounts, history12, thisSum.expense]);

  const deltas = useMemo(() => {
    const pct = (cur, prev) => prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0);
    return {
      income:      pct(thisSum.income,  prevSum.income),
      expense:     pct(thisSum.expense, prevSum.expense),
      net:         pct(thisSum.net,     prevSum.net),
      savingsRate: thisSum.savingsRate - prevSum.savingsRate,
    };
  }, [thisSum, prevSum]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="page-body" style={{ padding: isMobile ? '16px 14px 40px' : '24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 3 }}>
              {meta.sub}
            </div>
            <div style={{
              fontFamily: 'var(--f-display)', fontSize: isMobile ? 27 : 34, fontWeight: 700,
              letterSpacing: '-0.022em', color: 'var(--text-primary)', lineHeight: 1.1,
            }}>
              การเงิน<span style={{ color: meta.accent }}> {meta.label}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Import button only shown on Personal scope — auto-imports both scopes */}
            {scope === 'personal' && (
              <Button variant="ghost" size="sm" onClick={() => setShowImporter(true)}>📂 Import</Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowTransfer(true)} title="โอนระหว่าง scope">
              💸 โอน scope
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowAccForm(true)}>+ บัญชี</Button>
            <Button variant="primary" size="md" onClick={() => setShowTxnForm(true)}>
              <Icon name="plus" size={14}/> บันทึกรายการ
            </Button>
          </div>
        </div>

        {error && (
          <div style={{
            padding: '12px 16px', background: 'var(--danger-soft)', color: 'var(--danger)',
            border: 'none', borderRadius: 'var(--radius-field)', fontSize: 13,
          }}>
            ⚠️ {error}
          </div>
        )}
        {!error && loadWarning && (
          <div style={{
            padding: '12px 16px', background: 'var(--warning-soft)', color: 'var(--warning)',
            border: 'none', borderRadius: 'var(--radius-field)', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{ flex: 1 }}>⚠️ {loadWarning}</span>
            <Button variant="ghost" size="sm" onClick={refresh}>↻ ลองใหม่</Button>
          </div>
        )}
        {/* Audit B4 — the post-anchor ledger could not be read. Say it. */}
        {!error && balancesUnconfirmed && (
          <div style={{
            padding: '12px 16px', background: 'var(--warning-soft)', color: 'var(--warning)',
            border: 'none', borderRadius: 'var(--radius-field)', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{ flex: 1 }}>
              ⚠️ คำนวณยอดคงเหลือปัจจุบันไม่สำเร็จ — ตัวเลขบัญชี, Net Worth และกองทุนฉุกเฉิน
              ที่แสดงอยู่เป็น “ยอด ณ วันตั้งต้น” ยังไม่รวมรายการหลังจากนั้น ถือว่ายังไม่ยืนยัน
            </span>
            <Button variant="ghost" size="sm" onClick={refresh}>↻ ลองใหม่</Button>
          </div>
        )}
        {loading && (
          <div style={{
            padding: '8px 14px', background: 'var(--fill)', color: 'var(--text-secondary)',
            borderRadius: 'var(--radius-field)', fontSize: 11, fontFamily: 'var(--f-mono)',
            letterSpacing: '0.1em', textAlign: 'center',
          }}>
            กำลังโหลดข้อมูล…
          </div>
        )}

        {/* Sub-tabs — six rooms instead of one long scroll (v4.35).
            v4.38: mobile only. The breakpoint is the app-wide MOBILE_QUERY, the
            same one that swaps Sidebar for MobileNav in App.jsx, so exactly one
            of the two controls is on screen at any width. */}
        {isMobile && <FinanceTabs value={tab} onChange={setTab} />}

        <TabPanel id="overview" active={tab === 'overview'} tabbed={isMobile}>
            {/* Hero balance — คงเหลือสุทธิ + flows */}
            <div style={{ marginBottom: isMobile ? 6 : 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>คงเหลือสุทธิ</span>
                <MonthNav value={yearMonth} onChange={setYearMonth} />
              </div>
              <div style={{
                fontSize: isMobile ? 42 : 56, fontWeight: 700, letterSpacing: '-0.035em',
                lineHeight: 1.08, marginTop: 2, fontVariantNumeric: 'tabular-nums',
                color: thisSum.net >= 0 ? 'var(--text-primary)' : 'var(--danger)',
              }}>
                {(thisSum.net >= 0 ? '' : '-') + '฿' + Math.abs(thisSum.net).toLocaleString('th', { maximumFractionDigits: 0 })}
              </div>
              <div style={{ display: 'flex', gap: 26, marginTop: 12, flexWrap: 'wrap' }}>
                <FlowLine
                  tone="in" label="รายรับ"
                  amount={thisSum.income}
                  sub={`${txns.filter(t => t.amount > 0).length} ครั้ง`}
                />
                <FlowLine
                  tone="out" label="รายจ่าย"
                  amount={thisSum.expense}
                  sub={`${txns.filter(t => t.amount < 0).length} ครั้ง`}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 500 }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, background: 'var(--fill)', color: 'var(--text-secondary)',
                  }}>%</span>
                  <span style={{ color: 'var(--text-secondary)' }}>อัตราการออม</span>
                  <span style={{
                    fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                    color: thisSum.savingsRate >= 20 ? 'var(--success)' : thisSum.savingsRate >= 0 ? 'var(--text-primary)' : 'var(--danger)',
                  }}>
                    {isFinite(thisSum.savingsRate) ? thisSum.savingsRate.toFixed(1) + '%' : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Cash Flow chart */}
            <CashFlowChart data={trendData} selectedYm={yearMonth} currentYm={todayYm} onMonthClick={setYearMonth} />

            {/* Money Leaks / Insights */}
            <MoneyLeaks txns={txns} prevTxns={prevTxns} trend12={history12} debts={debts}
              allCategories={allCategories} accounts={accounts} onOpenDebts={scrollToDebts}
              yearMonth={yearMonth} />

            {/* Cash Flow Forecast 3 เดือนข้างหน้า */}
            <CashFlowForecastCard forecast={forecast} />

            {/* Net Worth + Emergency Fund */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <NetWorthCard accounts={accounts} unconfirmed={balancesUnconfirmed} />
              <EmergencyFundCard coverage={emergencyFund} accounts={accounts}
                unconfirmed={balancesUnconfirmed} onAccountToggle={refresh} />
            </div>
        </TabPanel>

        <TabPanel id="txns" active={tab === 'txns'} tabbed={isMobile}>
            {/* Month picker — the whole tab reads this one month */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>เดือน</span>
              <MonthNav value={yearMonth} onChange={setYearMonth} />
            </div>

            {/* Full transaction list */}
            <div style={{ background: 'var(--surface)', border: 'none', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)', padding: isMobile ? '18px 14px' : '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
                    รายการธุรกรรม
                    {/* Audited (DLG-FIN-001 · B1): clicking an account in บัญชี
                        lands here, so the filter has to say so where the rows
                        are — and be clearable without walking back a room. */}
                    {accountFilter && (
                      <span data-account-filter-chip style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 10,
                        padding: '3px 5px 3px 10px', borderRadius: 999, verticalAlign: 'middle',
                        background: 'var(--accent-tint)', color: 'var(--accent-strong)',
                        fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 500,
                      }}>
                        บัญชี: {accounts.find(a => a.id === accountFilter)?.name || 'ไม่พบบัญชี'}
                        <button type="button" className="focus-ring"
                          onClick={() => setAccountFilter(null)}
                          aria-label="ล้างตัวกรองบัญชี" title="ล้างตัวกรองบัญชี"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 16, height: 16, borderRadius: 999, border: 0, padding: 0,
                            background: 'transparent', color: 'inherit', cursor: 'pointer',
                            fontFamily: 'inherit', fontSize: 11, lineHeight: 1,
                          }}>✕</button>
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)', marginTop: 3 }}>
                    {(accountFilter ? txns.filter(t => t.account_id === accountFilter) : txns).length} รายการ · {formatThaiMonth(yearMonth)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {scope === 'personal' && (
                    <Button variant="ghost" size="sm" onClick={() => setShowImporter(true)}>📂 Import</Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setShowTxnForm(true)}>+ เพิ่ม</Button>
                  {txns.length > 0 && (
                    <Button variant="danger" size="sm"
                      onClick={async () => {
                        if (!confirm(`ลบรายการทั้ง ${txns.length} รายการในเดือน ${formatThaiMonth(yearMonth)}?\n(บัญชีจะยังอยู่)`)) return;
                        try { await deleteTransactionsInMonth(yearMonth, scope); refresh(); }
                        catch (e) { alert('ลบไม่สำเร็จ: ' + e.message); }
                      }}>
                      🗑 ล้างเดือนนี้
                    </Button>
                  )}
                </div>
              </div>

              {txns.length === 0 ? (
                <EmptyState
                  icon="📋"
                  title="ยังไม่มีรายการเดือนนี้"
                  description={scope === 'personal'
                    ? 'บันทึกรายการเอง หรือ import จาก Make — ระบบจะ auto-split ทั้ง ส่วนตัว + ครอบครัว ให้พร้อม'
                    : 'รายการครอบครัวจะมาจาก: (1) Import CSV ที่หน้า "การเงินส่วนตัว" — ระบบ auto-split scope · (2) บันทึกเองที่นี่'}
                  actionLabel={scope === 'personal' ? '📂 Import จาก Make' : '+ เพิ่มเอง'}
                  onAction={scope === 'personal' ? () => setShowImporter(true) : () => setShowTxnForm(true)}
                  secondaryLabel={scope === 'personal' ? '+ เพิ่มเอง' : null}
                  onSecondary={scope === 'personal' ? () => setShowTxnForm(true) : null}
                />
              ) : (
                <>
                  {/* Wallet-style rows: icon · (title + meta line) · amount · actions.
                      Every field is still inline-editable exactly as before — the date,
                      category and note cells just moved into the meta line under the
                      title, which also means no horizontal panning on mobile. */}
                  <div>
                  <div style={{ maxHeight: 600, overflow: 'auto' }}>
                    {(accountFilter ? txns.filter(t => t.account_id === accountFilter) : txns).map((t, i, arr) => {
                      const isIn = t.amount > 0;
                      return (
                        <div key={t.id} data-txn-row style={{
                          display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 12,
                          padding: isMobile ? '10px 0' : '10px 2px',
                          borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--hairline)',
                        }}>
                          <div style={{
                            width: isMobile ? 34 : 38, height: isMobile ? 34 : 38, borderRadius: '50%', flexShrink: 0,
                            background: 'var(--fill)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 15 : 17,
                          }}>{catIconOf(t.type)}</div>

                          {/* TITLE + meta line */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* TITLE — inline editable */}
                            <InlineEdit
                              value={t.title}
                              hint="คลิกเพื่อแก้ไขชื่อรายการ"
                              onSave={async title => {
                                await updateTransaction(t.id, { title });
                                refresh();
                              }}
                              cellStyle={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 500, padding: '1px 4px' }}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: isMobile ? 'nowrap' : 'wrap', marginTop: 1, minWidth: 0 }}>
                              {/* DATE — inline editable */}
                              <InlineEdit
                                value={bangkokDate(t.occurred_at)}
                                type="date"
                                display={txDate(t.occurred_at, isMobile)}
                                hint="คลิกเพื่อแก้ไขวันที่"
                                onSave={async date => {
                                  // Edit value + display + save all speak Bangkok:
                                  // the old UTC split showed "1 ก.ค." but opened
                                  // 30 มิ.ย., and re-saving walked the date back.
                                  // B5: on a transfer leg this moves BOTH legs.
                                  await updateTransactionMaybePaired(t, { occurred_at: withBangkokTime(date, t.occurred_at) });
                                  refresh();
                                }}
                                cellStyle={{ fontSize: 13, color: 'var(--text-secondary)', padding: '1px 4px' }}
                              />
                              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>·</span>
                              {/* CATEGORY — inline dropdown. Transfer rows are
                                  category-locked: recategorising a transfer leg
                                  books fake income/spending on both scopes. */}
                              {isTransfer(t) ? (
                                <span title="โอนระหว่าง scope — เปลี่ยนหมวด/จำนวนไม่ได้ (แก้ได้เฉพาะชื่อ/โน้ต/วันที่)"
                                  style={{
                                    fontSize: 12, color: 'var(--text-muted)', padding: '1px 6px',
                                    background: 'var(--fill)', borderRadius: 6, whiteSpace: 'nowrap',
                                  }}>
                                  🔒 โอนภายใน
                                </span>
                              ) : (
                              <InlineSelect
                                value={t.type}
                                options={allCategories.map(c => ({ value: c.id, label: c.label, icon: c.icon }))}
                                onSave={async newType => {
                                  const cat = allCategories.find(c => c.id === newType);
                                  const patch = { type: newType, category: cat?.label || newType };
                                  // Enforce the sign invariant on category change:
                                  // รายรับ ⇒ amount > 0, expense types ⇒ amount < 0.
                                  const abs = Math.abs(Number(t.amount) || 0);
                                  patch.amount = newType === 'income' ? abs : -abs;
                                  await updateTransaction(t.id, patch);
                                  refresh();
                                }}
                                onAdd={addCategory}
                                cellStyle={{ fontSize: 13, color: 'var(--text-secondary)', padding: '1px 4px' }}
                              />
                              )}
                              {/* NOTE stays on this line on desktop; on mobile it drops
                                  to its own line below so nothing has to truncate to
                                  three characters — still inline-editable either way. */}
                              {!isMobile && (
                                <>
                                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>·</span>
                                  <InlineEdit
                                    value={t.note}
                                    placeholder="+ เพิ่มโน้ต"
                                    hint="คลิกเพื่อแก้ไขโน้ต"
                                    onSave={async note => {
                                      await updateTransactionMaybePaired(t, { note: note || null });
                                      refresh();
                                    }}
                                    cellStyle={{ fontSize: 13, color: t.note ? 'var(--text-secondary)' : 'var(--text-muted)', padding: '1px 4px' }}
                                  />
                                </>
                              )}
                            </div>
                            {isMobile && (
                              <InlineEdit
                                value={t.note}
                                placeholder="+ เพิ่มโน้ต"
                                hint="คลิกเพื่อแก้ไขโน้ต"
                                onSave={async note => {
                                  await updateTransactionMaybePaired(t, { note: note || null });
                                  refresh();
                                }}
                                cellStyle={{ fontSize: 13, color: t.note ? 'var(--text-secondary)' : 'var(--text-muted)', padding: '1px 4px' }}
                              />
                            )}
                          </div>

                          {/* AMOUNT — inline editable, sign follows the TYPE.
                              Transfer rows are amount-locked (both legs must
                              stay mirrored; edit via a new transfer instead). */}
                          {isTransfer(t) ? (
                            <div title="โอนระหว่าง scope — จำนวนถูกล็อกให้สองฝั่งตรงกันเสมอ"
                              style={{
                                textAlign: 'right', fontSize: 15, fontVariantNumeric: 'tabular-nums',
                                color: 'var(--text-muted)', fontWeight: 600,
                                minWidth: isMobile ? 0 : 96, flexShrink: 0, whiteSpace: 'nowrap',
                                padding: '3px 6px',
                              }}>
                              {`${isIn ? '+' : '−'}฿${Math.abs(Number(t.amount)).toLocaleString('th', { maximumFractionDigits: 0 })}`}
                            </div>
                          ) : (
                          <InlineEdit
                            value={Math.abs(Number(t.amount))}
                            type="number"
                            display={`${isIn ? '+' : '−'}฿${Math.abs(Number(t.amount)).toLocaleString('th', { maximumFractionDigits: 0 })}`}
                            hint="คลิกเพื่อแก้ไขจำนวน (เครื่องหมายตามหมวด)"
                            onSave={async v => {
                              // Sign comes from the row's TYPE, not its possibly
                              // stale amount — รายรับ stays +, expenses stay −.
                              const sign = isIncomeTxn(t) ? 1 : -1;
                              await updateTransaction(t.id, { amount: Math.abs(Number(v)) * sign });
                              refresh();
                            }}
                            cellStyle={{
                              textAlign: 'right', fontSize: 15, fontVariantNumeric: 'tabular-nums',
                              color: isIn ? 'var(--success)' : 'var(--text-primary)', fontWeight: 600,
                              minWidth: isMobile ? 0 : 96, flexShrink: 0, whiteSpace: 'nowrap',
                            }}
                            inputStyle={{ textAlign: 'right', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}
                          />
                          )}
                          {/* ACTIONS — link recurring + delete + full-edit drawer */}
                          <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end', flexShrink: 0 }}>
                            <button onClick={(e) => {
                              const row = e.currentTarget.closest('[data-txn-row]');
                              const rect = (row || e.currentTarget).getBoundingClientRect();
                              setLinkingTxn({ txn: t, anchorRect: rect });
                            }} title={t.recurring_id ? 'ผูกกับบิลประจำแล้ว — คลิกเพื่อเปลี่ยน' : 'ผูกกับบิลประจำ'} aria-label="ผูกบิลประจำ"
                              style={{
                                color: t.recurring_id ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, background: 'none', border: 0,
                                cursor: 'pointer', width: isMobile ? 24 : 28, height: isMobile ? 24 : 28, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 150ms, color 150ms', opacity: t.recurring_id ? 1 : 0.7,
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--fill-2)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                              🔁
                            </button>
                            <button onClick={(e) => {
                              // Anchor to the whole ROW (not just the button) so the popup
                              // centers over the transaction table, not over the sidebar.
                              const row = e.currentTarget.closest('[data-txn-row]');
                              const rect = (row || e.currentTarget).getBoundingClientRect();
                              setEditingTxn({ ...t, _anchorRect: rect });
                            }} title="แก้ไขทุก field (popup ตรงนี้)" aria-label="แก้ไขเต็ม"
                              style={{
                                color: 'var(--text-muted)', fontSize: 13, background: 'none', border: 0,
                                cursor: 'pointer', width: isMobile ? 24 : 28, height: isMobile ? 24 : 28, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 150ms, color 150ms',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--fill-2)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                              ⋯
                            </button>
                            <button onClick={() => handleDeleteTxn(t)}
                              title="ลบ" aria-label="ลบ"
                              style={{
                                color: 'var(--text-muted)', fontSize: 15, background: 'none', border: 0,
                                cursor: 'pointer', width: isMobile ? 24 : 28, height: isMobile ? 24 : 28, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 150ms, color 150ms',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </div>
                </>
              )}
            </div>

            {/* Categories + Top 10 */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <CategoryBreakdown data={categories} totalExpense={thisSum.expense} />
              <TopExpenses data={top10} />
            </div>

            {/* Daily heatmap */}
            <DailyHeatmap dailyMap={dailyMap} yearMonth={yearMonth} />
        </TabPanel>

        <TabPanel id="cards" active={tab === 'cards'} tabbed={isMobile}>
            {/* `debts` is the list this page already loaded — a card linked to a
                debt row reads its balance from there, never from a second
                fetch, so the two can never disagree on screen. */}
            <CreditCards scope={scope} debts={debts} isMobile={isMobile} />
        </TabPanel>

        <TabPanel id="debt" active={tab === 'debt'} tabbed={isMobile}>
            {/* Debt Tracker — the เงินรั่ว debt row jumps to this anchor (v4.34).
                tabIndex -1 makes the anchor a legal focus target so the jump can
                hand the keyboard over (A1); it stays out of the tab order. */}
            <div id={DEBT_TRACKER_ANCHOR} tabIndex={-1} style={{ outline: 'none' }}>
              {/* Computed advice card — reads the same `debts` the tracker does,
                  renders nothing when there is no computable signal (v4.46). */}
              <DebtAdvice debts={debts} />
              {/* Payoff simulator — slide the extra to see how much sooner all
                  filled-in debts clear and how much interest is saved (v4.48). */}
              <MoneyPlanner debts={debts} />
              <DebtTracker
                debts={debts}
                payments={debtPayments}
                yearMonth={yearMonth}
                scope={scope}
                onChange={refresh}
              />
            </div>
        </TabPanel>

        <TabPanel id="budget" active={tab === 'budget'} tabbed={isMobile}>
            {/* Budget vs Actual */}
            <BudgetProgress budgets={budgets} categoryActuals={categories} />

            {/* Recurring Expenses.
                historyTxns = 12-month window: the suggestion detector needs 2+
                months of history — feeding it the single viewed month meant
                suggestions could NEVER appear. Status checks still use txns. */}
            <RecurringTracker recurring={recurring} transactions={txns} historyTxns={history12}
              yearMonth={yearMonth} scope={scope} onChange={refresh} />

            {/* Goals */}
            <div style={{ background: 'var(--surface)', border: 'none', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)', padding: '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>เป้าหมายการเงิน</div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)', marginTop: 3 }}>
                    {goals.length} เป้าหมาย
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setShowGoalForm(true)}>+ เพิ่ม</Button>
              </div>
              {goals.length === 0 ? (
                <EmptyState
                  icon="◎"
                  title="ยังไม่มีเป้าหมายการเงิน"
                  description="เริ่มจาก 1 เป้าหมาย เช่น 'ออมเงินดาวน์บ้าน' หรือ 'ลดหนี้บัตรเครดิต'"
                  actionLabel="เพิ่มเป้าหมายแรก"
                  onAction={() => setShowGoalForm(true)}
                  compact
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {goals.map(g => {
                    // target 0/blank made this NaN% — guard before dividing.
                    const target = Number(g.target_amount) || 0;
                    const pct = target > 0
                      ? Math.min(Math.round((Number(g.current_amount) / target) * 100), 100)
                      : 0;
                    return (
                      <div key={g.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--text-primary)' }}>{g.title}</div>
                            {g.deadline && (
                              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                                ⌛ {new Date(g.deadline).toLocaleDateString('th-TH')}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                              ฿{Number(g.current_amount).toLocaleString('th')} / ฿{Number(g.target_amount).toLocaleString('th')}
                            </div>
                            <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: pct >= 100 ? 'var(--success)' : 'var(--accent)', fontWeight: 600 }}>
                              {pct}%
                            </div>
                          </div>
                        </div>
                        <div style={{ height: 4, background: 'var(--fill)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: pct >= 100 ? 'var(--success)' : 'var(--accent)', transition: 'width 300ms' }} />
                        </div>
                        <button onClick={() => { if (confirm('ลบเป้าหมายนี้?')) deleteGoal(g.id).then(refresh); }}
                          className="focus-ring"
                          style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 11, background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>ลบ</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
        </TabPanel>

        <TabPanel id="accounts" active={tab === 'accounts'} tabbed={isMobile}>
            {/* Accounts */}
            <div style={{ background: 'var(--surface)', border: 'none', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)', padding: '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
                    บัญชี & ทรัพย์สิน
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)', marginTop: 3 }}>
                    {accounts.length} บัญชี · รวม{' '}
                    <strong style={{ color: balancesUnconfirmed ? 'var(--warning)' : 'var(--ink-2)' }}>
                      ฿{accounts.reduce((s, a) => s + Number(a.balance || 0), 0).toLocaleString('th', { maximumFractionDigits: 0 })}
                    </strong>
                    {balancesUnconfirmed && (
                      <span style={{ color: 'var(--warning)', fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.12em', marginLeft: 6 }}>
                        · ยังไม่ยืนยัน
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {accountFilter && (
                    <Button variant="ghost" size="sm" onClick={() => setAccountFilter(null)}>× ล้าง filter</Button>
                  )}
                  {/* Same modal the header button opens — account moves belong
                      in the accounts room too, not only up in the toolbar. */}
                  <Button variant="ghost" size="sm" onClick={() => setShowTransfer(true)} title="โอนระหว่าง scope">
                    💸 โอน scope
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setShowAccForm(true)}>+ เพิ่ม</Button>
                </div>
              </div>
              {accounts.length === 0 ? (
                <EmptyState
                  icon="💼"
                  title="ยังไม่มีบัญชี"
                  description={scope === 'personal'
                    ? 'import CSV จาก Make จะสร้างบัญชี (Cloud Pockets) ให้อัตโนมัติ พร้อมยอดล่าสุด'
                    : 'บัญชีครอบครัว (เช่น "กองทุนครอบครัว", "เงินเพื่อน้องอคิน") จะถูกสร้างอัตโนมัติเมื่อ Import CSV ที่หน้าการเงินส่วนตัว'}
                  actionLabel={scope === 'personal' ? '📂 Import จาก Make' : '+ สร้างเอง'}
                  onAction={scope === 'personal' ? () => setShowImporter(true) : () => setShowAccForm(true)}
                  secondaryLabel={scope === 'personal' ? '+ สร้างเอง' : null}
                  onSecondary={scope === 'personal' ? () => setShowAccForm(true) : null}
                  compact
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 340, overflow: 'auto', marginTop: 2 }}>
                  {accounts.map(a => {
                    const isSelected = accountFilter === a.id;
                    const txCount = txns.filter(t => t.account_id === a.id).length;
                    return (
                      <div key={a.id}
                        // Audited (DLG-FIN-001 · B1): the filtered rows live in
                        // the รายการ room, so selecting an account goes there
                        // instead of leaving the result somewhere the user has
                        // to find. Clicking the already-selected row still
                        // clears the filter and stays put.
                        onClick={() => {
                          if (isSelected) { setAccountFilter(null); return; }
                          setAccountFilter(a.id);
                          setTab('txns');
                        }}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '9px 12px', borderRadius: 10,
                          background: isSelected ? 'var(--accent-tint)' : 'transparent',
                          border: 'none',
                          fontSize: 13, cursor: 'pointer', transition: 'background 150ms',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--fill)'; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0 }}>
                          <span style={{ width: 4, height: 26, borderRadius: 2, background: toneColor(a.tone), flexShrink: 0 }} />
                          <div style={{ overflow: 'hidden', minWidth: 0 }}>
                            <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 500 : 400 }}>{a.name}</div>
                            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                              {a.type}{txCount > 0 && ` · ${txCount} txn เดือนนี้`}
                              {a.balance_anchor_at && (a._balance_unconfirmed
                                ? ` · ยอด ณ ${txDate(a.balance_anchor_at)} · ยังไม่รวมรายการหลังจากนั้น`
                                : ` · ยอด ณ ${txDate(a.balance_anchor_at)} + รายการหลังจากนั้น`)}
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: a._balance_unconfirmed ? 'var(--warning)' : (Number(a.balance) >= 0 ? 'var(--text-primary)' : 'var(--danger)') }}
                            title={a._balance_unconfirmed ? 'ยังไม่ยืนยัน — อ่านรายการหลังวันตั้งต้นไม่สำเร็จ' : undefined}>
                            ฿{Number(a.balance).toLocaleString('th', { maximumFractionDigits: 0 })}
                            {a._balance_unconfirmed && (
                              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.1em', marginLeft: 5 }}>
                                ยังไม่ยืนยัน
                              </span>
                            )}
                          </div>
                          {/* Edit + archive replaced the hard delete — deleting
                              an account nulled account_id on its whole history
                              and destroyed the balance with no undo. */}
                          <button onClick={(e) => { e.stopPropagation(); setEditingAccount(a); }}
                            aria-label={`แก้ไขบัญชี ${a.name}`} title="แก้ไข / ตั้งยอด / เก็บบัญชี"
                            style={{ color: 'var(--text-muted)', fontSize: 13, background: 'none', border: 0, cursor: 'pointer', padding: 4 }}>✎</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
        </TabPanel>

        {/* Footer */}
        <div style={{
          marginTop: 4, padding: '10px 16px', borderTop: '1px solid var(--hairline)',
          fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)',
          letterSpacing: '0.1em', textAlign: 'center',
        }}>
          {txns.length} รายการ · {accounts.length} บัญชี · {budgets.length} งบ · {goals.length} เป้าหมาย
          {!isSupabaseConfigured && ' · DEMO MODE'}
        </div>
      </div>

      {showTxnForm && <TxnForm accounts={accounts} scope={scope} categories={allCategories} onAddCategory={addCategory} onSave={refresh} onClose={() => setShowTxnForm(false)} />}
      {editingTxn  && <TxnForm accounts={accounts} scope={scope} categories={allCategories} onAddCategory={addCategory} initialTxn={editingTxn} onSave={refresh} onClose={() => setEditingTxn(null)} />}
      {linkingTxn  && <RecurringLinkMenu txn={linkingTxn.txn} recurring={recurring} anchorRect={linkingTxn.anchorRect}
        onPick={async (rid) => {
          try {
            await updateTransaction(linkingTxn.txn.id, { recurring_id: rid });
            setLinkingTxn(null); refresh();
          } catch (err) {
            const msg = /recurring_id|column|schema/i.test(err.message || '')
              ? 'ยังไม่ได้รัน SQL — เปิด Supabase แล้วรัน migration_add_txn_recurring_link.sql ก่อนนะครับ'
              : err.message;
            alert(msg);
          }
        }}
        onClose={() => setLinkingTxn(null)} />}
      {showTransfer && (
        <ScopeTransferModal
          defaultFromScope={scope}
          onSaved={refresh}
          onClose={() => setShowTransfer(false)}
        />
      )}
      {showAccForm && <AccountModal scope={scope} accounts={accounts} onSave={refresh} onClose={() => setShowAccForm(false)} />}
      {editingAccount && <AccountModal scope={scope} accounts={accounts} initial={editingAccount} onSave={refresh} onClose={() => setEditingAccount(null)} />}
      {showGoalForm && <GoalModal scope={scope} onSave={refresh} onClose={() => setShowGoalForm(false)} />}
      {showImporter && <CSVImporter scope={scope} debts={debts} onImported={refresh} onClose={() => setShowImporter(false)} />}
    </>
  );
}

// Backward-compat default export
export function Finance() { return <FinanceView scope="personal" />; }

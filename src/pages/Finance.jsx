import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Icon } from '../components/Icon.jsx';
import { CSVImporter } from '../components/CSVImporter.jsx';
import { toneColor } from '../lib/helpers.js';
import {
  listTransactions, listTransactionsRange, createTransaction, updateTransaction, deleteTransaction,
  listAccounts, createAccount, deleteAccount, updateAccount,
  listBudgets, listGoals, createGoal, deleteGoal,
  summarize, aggregateByMonth, aggregateByCategory, aggregateByDay, topExpenses,
  previousMonth, lastNMonths, getMonthBounds, currentYearMonth,
  deleteTransactionsInMonth,
  listDebts, listDebtPayments,
  listRecurring, forecastCashFlow, computeEmergencyFundCoverage,
} from '../lib/api/finance.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { MonthNav, formatThaiMonth } from '../components/dashboard/MonthNav.jsx';
import { KPICard, formatBaht } from '../components/dashboard/KPICard.jsx';
import { CashFlowChart } from '../components/dashboard/CashFlowChart.jsx';
import { CategoryBreakdown, TopExpenses, BudgetProgress, NetWorthCard, DailyHeatmap } from '../components/dashboard/Charts.jsx';
import { DebtTracker } from '../components/dashboard/DebtTracker.jsx';
import { RecurringTracker, CashFlowForecastCard, EmergencyFundCard } from '../components/dashboard/FinanceWidgets.jsx';
import { ScopeTransferModal } from '../components/dashboard/ScopeTransferModal.jsx';
import { MoneyLeaks } from '../components/dashboard/MoneyLeaks.jsx';
import { Button, Card, CardHeader, Badge, EmptyState } from '../components/ui/index.js';

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

function txDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

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
    const next = type === 'number' ? (draft === '' ? null : Number(draft))
              : (typeof draft === 'string' ? draft.trim() : draft);
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
          width: '100%', background: 'var(--surface-2)',
          border: '1px solid var(--amber)', borderRadius: 4,
          padding: '3px 6px', fontSize: 12, color: 'var(--ink)',
          fontFamily: 'inherit', outline: 'none', ...inputStyle,
        }}
      />
    );
  }
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <div
      onClick={() => setEditing(true)} title={hint}
      style={{
        cursor: 'text', padding: '3px 6px', borderRadius: 4,
        border: '1px dashed transparent', transition: 'all 130ms',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontStyle: isEmpty ? 'italic' : 'normal',
        color: isEmpty ? 'var(--ink-4)' : undefined,
        ...cellStyle,
      }}
      onMouseEnter={e => { e.currentTarget.style.border = '1px dashed var(--line)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { e.currentTarget.style.border = '1px dashed transparent'; e.currentTarget.style.background = 'transparent'; }}
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
          width: '100%', background: 'var(--surface-2)',
          border: '1px solid var(--amber)', borderRadius: 4,
          padding: '2px 5px', fontSize: 11, color: 'var(--ink)',
          fontFamily: 'inherit', outline: 'none',
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
        cursor: 'pointer', padding: '3px 6px', borderRadius: 4,
        border: '1px dashed transparent', transition: 'all 130ms',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontSize: 11, color: 'var(--ink-3)', ...cellStyle,
      }}
      onMouseEnter={e => { e.currentTarget.style.border = '1px dashed var(--line)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { e.currentTarget.style.border = '1px dashed transparent'; e.currentTarget.style.background = 'transparent'; }}
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
        occurred_at: (initialTxn.occurred_at || '').split('T')[0] || new Date().toISOString().split('T')[0],
      };
    }
    return {
      title: '', amount: '', type: 'food', account_id: accounts[0]?.id || '',
      note: '', occurred_at: new Date().toISOString().split('T')[0],
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isIncome = form.type === 'income';

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
      const amount = Number(form.amount) * (isIncome ? 1 : -1);
      const payload = {
        title: form.title.trim(), amount, type: form.type,
        category: categories.find(c => c.id === form.type)?.label || form.type,
        account_id: form.account_id || null,
        note: form.note.trim() || null,
        occurred_at: form.occurred_at,
        scope,
      };
      if (isEdit) await updateTransaction(initialTxn.id, payload);
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
        background: popupPos ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.55)',
        backdropFilter: popupPos ? 'none' : 'blur(2px)',
      }} />
      <form ref={formRef} onSubmit={handleSubmit} style={{
        position: popupPos ? 'absolute' : 'relative',
        top:   popupPos ? popupPos.top  : undefined,
        left:  popupPos ? popupPos.left : undefined,
        width: POPUP_W, maxWidth: 'calc(100vw - 28px)',
        maxHeight: popupPos ? popupPos.maxH : '88vh',
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-xl)', padding: 22,
        overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
        animation: 'popIn 160ms cubic-bezier(.2,.9,.3,1.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>
            {isEdit ? '✎ แก้ไขรายการ' : 'บันทึกรายการ'}
          </div>
          <button type="button" onClick={onClose} style={{ color: 'var(--ink-3)', fontSize: 18, background: 'none', border: 0, cursor: 'pointer' }}>×</button>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>ประเภท</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {categories.map(c => (
              <button key={c.id} type="button" onClick={() => set('type', c.id)}
                style={{ padding: '5px 10px', borderRadius: 'var(--r-md)', fontSize: 12, background: form.type === c.id ? 'var(--amber)' : 'var(--surface-2)', color: form.type === c.id ? '#1a1410' : 'var(--ink-2)', border: `1px solid ${form.type === c.id ? 'var(--amber)' : 'var(--line)'}`, cursor: 'pointer' }}>
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
                style={{ padding: '5px 10px', borderRadius: 'var(--r-md)', fontSize: 12, background: 'transparent', color: 'var(--ink-3)', border: '1px dashed var(--line)', cursor: 'pointer' }}>
                + เพิ่มหมวด
              </button>
            )}
          </div>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>รายการ</span>
          <input ref={firstInputRef} className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="เช่น ข้าวกลางวัน, ค่าน้ำมัน" required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>จำนวน (บาท) {isIncome ? '— รายรับ (+)' : '— รายจ่าย (-)'}</span>
          <input className="input" type="number" min="0" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" required />
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
        {error && <div style={{ padding: '10px 12px', background: 'var(--loss-bg)', color: 'var(--loss)', border: '1px solid #4a2e2a', borderRadius: 'var(--r-md)', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
          <Button type="button" variant="outline" onClick={onClose} fullWidth>ยกเลิก</Button>
          <Button type="submit" disabled={saving} variant="primary" fullWidth>{saving ? '...' : (isEdit ? '💾 บันทึกการแก้ไข' : '💾 บันทึก')}</Button>
        </div>
      </form>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Account Modal
// ════════════════════════════════════════════════════════════════════════════
function AccountModal({ scope, onSave, onClose }) {
  const [form, setForm] = useState({ name: '', type: 'savings', balance: '', tone: 'amber' });
  const [saving, setSaving] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await createAccount({ name: form.name, type: form.type, balance: Number(form.balance) || 0, tone: form.tone, scope }); onSave(); onClose(); }
    catch (err) { alert(err.message); } finally { setSaving(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <form onSubmit={handleSubmit} style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', padding: 32, width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>เพิ่มบัญชี</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>ชื่อบัญชี</span>
          <input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Make by KBank ออมทรัพย์" required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>ประเภท</span>
          <select className="input" value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))}>
            <option value="savings">ออมทรัพย์</option><option value="checking">กระแสรายวัน</option>
            <option value="investment">การลงทุน</option><option value="cash">เงินสด</option>
            <option value="debt">หนี้สิน</option><option value="crypto">คริปโต</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>ยอดเริ่มต้น (บาท)</span>
          <input className="input" type="number" value={form.balance} onChange={e => setForm(f => ({...f, balance: e.target.value}))} placeholder="0" />
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button type="button" variant="outline" onClick={onClose} fullWidth>ยกเลิก</Button>
          <Button type="submit" disabled={saving} variant="primary" fullWidth>{saving ? '...' : '+ เพิ่มบัญชี'}</Button>
        </div>
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
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <form onSubmit={handleSubmit} style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', padding: 32, width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>ตั้งเป้าหมาย</div>
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative', width: 340, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto',
        background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)',
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
                textAlign: 'left', padding: '11px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: 14,
                border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                background: active ? 'var(--accent-soft)' : 'var(--surface)',
                color: active ? 'var(--accent-strong)' : 'var(--ink)',
              }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              {active && <span style={{ flexShrink: 0 }}>✓ ผูกอยู่</span>}
            </button>
          );
        })}
        {txn.recurring_id && (
          <button onClick={() => onPick(null)}
            style={{ width: '100%', textAlign: 'center', padding: '9px', borderRadius: 'var(--r-md)', color: 'var(--danger)', fontSize: 12.5, cursor: 'pointer', marginTop: 4 }}>
            × ยกเลิกการผูก
          </button>
        )}
        <button onClick={onClose} className="btn btn--ghost" style={{ marginTop: 8 }}>ปิด</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Shared FinanceView — Financial Planner Edition
// ════════════════════════════════════════════════════════════════════════════
export function FinanceView({ scope }) {
  const meta = SCOPE_META[scope] || SCOPE_META.personal;

  // Always default to today's month on page open.
  // (User can still navigate to other months via MonthNav during the session
  // — but we no longer persist that across sessions / page reloads.)
  const [yearMonth, setYearMonth] = useState(() => currentYearMonth());
  const [accountFilter, setAccountFilter] = useState(null);   // account_id or null

  const [txns, setTxns]         = useState([]);
  const [prevTxns, setPrevTxns] = useState([]);
  const [trend12, setTrend12]   = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [budgets, setBudgets]   = useState([]);
  const [goals, setGoals]       = useState([]);
  const [debts, setDebts]       = useState([]);
  const [debtPayments, setDebtPayments] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const [showTxnForm, setShowTxnForm]   = useState(false);
  const [editingTxn,  setEditingTxn]    = useState(null);
  const [linkingTxn,  setLinkingTxn]    = useState(null);
  const [showAccForm, setShowAccForm]   = useState(false);
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

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setTxns([]); setPrevTxns([]); setTrend12([]); setAccounts([]); setBudgets([]); setGoals([]);
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    try {
      const prev = previousMonth(yearMonth);
      const months12 = lastNMonths(12, yearMonth);
      const { start: startTrend } = getMonthBounds(months12[0]);
      const { end:   endTrend   } = getMonthBounds(months12[months12.length - 1]);

      // Date range for debt payments (12 months of history + future for forecast)
      const { start: paymentStart } = getMonthBounds(months12[0]);
      const { end:   paymentEnd   } = getMonthBounds(months12[months12.length - 1]);

      const [t, p, r12, a, b, g, d, dp, rec] = await Promise.all([
        listTransactions({ yearMonth, scope, limit: 2000 }),
        listTransactions({ yearMonth: prev, scope, limit: 2000 }),
        listTransactionsRange({ startDate: startTrend, endDate: endTrend, scope }),
        listAccounts({ scope }),
        listBudgets(yearMonth, scope),
        listGoals(scope),
        listDebts({ scope }).catch(() => []),
        listDebtPayments({ startMonth: paymentStart, endMonth: paymentEnd }).catch(() => []),
        listRecurring({ scope }).catch(() => []),
      ]);

      setTxns(t || []); setPrevTxns(p || []); setTrend12(r12 || []);
      setAccounts(a || []); setBudgets(b || []); setGoals(g || []);
      setDebts(d || []); setDebtPayments(dp || []);
      setRecurring(rec || []);
    } catch (err) {
      setError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally { setLoading(false); }
  }, [yearMonth, scope]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Computed ────────────────────────────────────────────────────────────────
  const thisSum = useMemo(() => summarize(txns),     [txns]);
  const prevSum = useMemo(() => summarize(prevTxns), [prevTxns]);

  const trendData = useMemo(() => {
    const agg = aggregateByMonth(trend12);
    const months = lastNMonths(12, yearMonth);
    return months.map(ym => agg.find(a => a.ym === ym) || { ym, income: 0, expense: 0, net: 0, savingsRate: 0, count: 0 });
  }, [trend12, yearMonth]);

  const categories = useMemo(() => aggregateByCategory(txns), [txns]);
  const top10      = useMemo(() => topExpenses(txns, 10),      [txns]);
  const dailyMap   = useMemo(() => aggregateByDay(txns, yearMonth), [txns, yearMonth]);

  // Cash Flow Forecast — uses avg of last 3 months for variable expense
  const forecast = useMemo(() => {
    const recurringTotal = recurring.reduce((s, r) => s + Number(r.amount || 0), 0);
    const trendAgg = aggregateByMonth(trend12).slice(-3);
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
  }, [recurring, debts, trend12]);

  // Emergency fund coverage
  const emergencyFund = useMemo(() => {
    const trendAgg = aggregateByMonth(trend12).slice(-3);
    const avgExpense = trendAgg.length ? trendAgg.reduce((s, x) => s + x.expense, 0) / trendAgg.length : thisSum.expense;
    return computeEmergencyFundCoverage(accounts, avgExpense);
  }, [accounts, trend12, thisSum.expense]);

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
      <div className="page-body" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.18em', marginBottom: 5 }}>
              FINANCIAL PLANNER · {formatThaiMonth(yearMonth).toUpperCase()} · {accounts.length} บัญชี
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 30, color: 'var(--ink)', lineHeight: 1.1 }}>
              การเงิน <em style={{ color: meta.accent }}>{meta.label}</em>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 5 }}>
              {meta.sub}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <MonthNav value={yearMonth} onChange={setYearMonth} />
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
            border: '1px solid var(--danger)', borderRadius: 'var(--radius-control)', fontSize: 13,
          }}>
            ⚠️ {error}
          </div>
        )}
        {loading && (
          <div style={{
            padding: '8px 14px', background: 'var(--surface-muted)', color: 'var(--text-muted)',
            borderRadius: 'var(--radius-control)', fontSize: 11, fontFamily: 'var(--f-mono)',
            letterSpacing: '0.1em', textAlign: 'center',
          }}>
            กำลังโหลดข้อมูล…
          </div>
        )}

        {/* Row 1: KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <KPICard
            label="รายรับเดือนนี้" sub={`${txns.filter(t => t.amount > 0).length} ครั้ง`}
            value={'+' + formatBaht(thisSum.income, { compact: true })}
            valueColor="var(--profit)" accent="var(--profit)"
            delta={deltas.income} deltaLabel="vs เดือนก่อน"
          />
          <KPICard
            label="รายจ่ายเดือนนี้" sub={`${txns.filter(t => t.amount < 0).length} ครั้ง`}
            value={'-' + formatBaht(thisSum.expense, { compact: true })}
            valueColor="var(--loss)" accent="var(--loss)"
            delta={-deltas.expense} deltaLabel="vs เดือนก่อน"
          />
          <KPICard
            label="คงเหลือสุทธิ" sub="รายรับ − รายจ่าย"
            value={(thisSum.net >= 0 ? '+' : '-') + formatBaht(Math.abs(thisSum.net), { compact: true })}
            valueColor={thisSum.net >= 0 ? 'var(--ink)' : 'var(--loss)'}
            accent={thisSum.net >= 0 ? 'var(--amber)' : 'var(--loss)'}
            delta={deltas.net} deltaLabel="vs เดือนก่อน"
          />
          <KPICard
            label="อัตราการออม" sub="% ของรายรับ"
            value={isFinite(thisSum.savingsRate) ? thisSum.savingsRate.toFixed(1) + '%' : '—'}
            valueColor={thisSum.savingsRate >= 20 ? 'var(--profit)' : thisSum.savingsRate >= 0 ? 'var(--amber)' : 'var(--loss)'}
            accent={thisSum.savingsRate >= 20 ? 'var(--profit)' : 'var(--amber)'}
            delta={deltas.savingsRate} deltaLabel="pp"
          />
        </div>

        {/* Row 2: Cash Flow chart */}
        <CashFlowChart data={trendData} currentYm={yearMonth} onMonthClick={setYearMonth} />

        {/* Row 2b: Money Leaks / Insights */}
        <MoneyLeaks txns={txns} prevTxns={prevTxns} trend12={trend12} debts={debts} allCategories={allCategories} />

        {/* Row 2c: Cash Flow Forecast 3 เดือนข้างหน้า */}
        <CashFlowForecastCard forecast={forecast} />

        {/* Row 3: Categories + Top 10 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <CategoryBreakdown data={categories} totalExpense={thisSum.expense} />
          <TopExpenses data={top10} />
        </div>

        {/* Row 4: Budget vs Actual */}
        <BudgetProgress budgets={budgets} categoryActuals={categories} />

        {/* Row 4a: Recurring Expenses */}
        <RecurringTracker recurring={recurring} transactions={txns}
          yearMonth={yearMonth} scope={scope} onChange={refresh} />

        {/* Row 4b: Debt Tracker */}
        <DebtTracker
          debts={debts}
          payments={debtPayments}
          yearMonth={yearMonth}
          scope={scope}
          onChange={refresh}
        />

        {/* Row 5: Net Worth + Emergency Fund + Heatmap */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 14 }}>
          <NetWorthCard accounts={accounts} />
          <EmergencyFundCard coverage={emergencyFund} accounts={accounts} onAccountToggle={refresh} />
          <DailyHeatmap dailyMap={dailyMap} yearMonth={yearMonth} />
        </div>

        {/* Row 6: Accounts + Goals (CRUD) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Accounts */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--ink)' }}>
                  บัญชี & ทรัพย์สิน
                </div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 3, letterSpacing: '0.1em' }}>
                  {accounts.length} บัญชี · รวม{' '}
                  <strong style={{ color: 'var(--ink-2)' }}>
                    ฿{accounts.reduce((s, a) => s + Number(a.balance || 0), 0).toLocaleString('th', { maximumFractionDigits: 0 })}
                  </strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {accountFilter && (
                  <Button variant="ghost" size="sm" onClick={() => setAccountFilter(null)}>× ล้าง filter</Button>
                )}
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
                      onClick={() => setAccountFilter(isSelected ? null : a.id)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 12px', borderRadius: 'var(--radius-control)',
                        background: isSelected ? 'var(--accent-soft)' : 'transparent',
                        border: '1px solid ' + (isSelected ? 'var(--accent)' : 'transparent'),
                        fontSize: 12.5, cursor: 'pointer', transition: 'all 130ms',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-muted)'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0 }}>
                        <span style={{ width: 4, height: 26, borderRadius: 2, background: toneColor(a.tone), flexShrink: 0 }} />
                        <div style={{ overflow: 'hidden', minWidth: 0 }}>
                          <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 500 : 400 }}>{a.name}</div>
                          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                            {a.type}{txCount > 0 && ` · ${txCount} txn เดือนนี้`}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, fontWeight: 500, color: Number(a.balance) >= 0 ? 'var(--text-primary)' : 'var(--danger)' }}>
                          ฿{Number(a.balance).toLocaleString('th', { maximumFractionDigits: 0 })}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); if (confirm(`ลบบัญชี "${a.name}"?`)) deleteAccount(a.id).then(refresh); }}
                          aria-label={`ลบบัญชี ${a.name}`}
                          style={{ color: 'var(--text-muted)', fontSize: 14, background: 'none', border: 0, cursor: 'pointer', padding: 4 }}>×</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Goals */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--ink)' }}>เป้าหมายการเงิน</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 3, letterSpacing: '0.1em' }}>
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
                  const pct = Math.min(Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100), 100);
                  return (
                    <div key={g.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>{g.title}</div>
                          {g.deadline && (
                            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                              ⌛ {new Date(g.deadline).toLocaleDateString('th-TH')}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                            ฿{Number(g.current_amount).toLocaleString('th')} / ฿{Number(g.target_amount).toLocaleString('th')}
                          </div>
                          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: pct >= 100 ? 'var(--success)' : 'var(--accent-strong)', fontWeight: 500 }}>
                            {pct}%
                          </div>
                        </div>
                      </div>
                      <div style={{ height: 6, background: 'var(--surface-muted)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--success)' : 'var(--accent)', transition: 'width 300ms' }} />
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
        </div>

        {/* Row 7: Full transaction list */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--ink)' }}>
                รายการธุรกรรม
                {accountFilter && (
                  <span style={{ marginLeft: 10, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--amber)' }}>
                    · กรอง: {accounts.find(a => a.id === accountFilter)?.name}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 3, letterSpacing: '0.1em' }}>
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
              <div style={{
                display: 'grid', gridTemplateColumns: '32px 90px 1.3fr 1.2fr 130px 110px 60px', gap: 10,
                padding: '6px 12px', fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '0.16em',
                textTransform: 'uppercase', color: 'var(--ink-3)', borderBottom: '1px solid var(--line)',
              }}>
                <div/><div>วันที่</div><div>รายการ</div><div>โน้ต</div><div>หมวด</div>
                <div style={{ textAlign: 'right' }}>จำนวน</div><div/>
              </div>
              <div style={{ maxHeight: 600, overflow: 'auto' }}>
                {(accountFilter ? txns.filter(t => t.account_id === accountFilter) : txns).map(t => {
                  const isIn = t.amount > 0;
                  return (
                    <div key={t.id} data-txn-row style={{
                      display: 'grid', gridTemplateColumns: '32px 90px 1.3fr 1.2fr 130px 110px 86px', gap: 10,
                      padding: '9px 12px', borderBottom: '1px solid var(--line)',
                      alignItems: 'center', fontSize: 12.5,
                    }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: 6,
                        background: 'var(--surface-2)', border: '1px solid var(--line)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                      }}>{catIconOf(t.type)}</div>
                      {/* DATE — inline editable */}
                      <InlineEdit
                        value={t.occurred_at ? t.occurred_at.split('T')[0] : ''}
                        type="date"
                        display={txDate(t.occurred_at)}
                        hint="คลิกเพื่อแก้ไขวันที่"
                        onSave={async date => {
                          const time = (t.occurred_at || '').split('T')[1] || '12:00:00+07:00';
                          await updateTransaction(t.id, { occurred_at: `${date}T${time}` });
                          refresh();
                        }}
                        cellStyle={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-3)' }}
                      />
                      {/* TITLE — inline editable */}
                      <InlineEdit
                        value={t.title}
                        hint="คลิกเพื่อแก้ไขชื่อรายการ"
                        onSave={async title => {
                          await updateTransaction(t.id, { title });
                          refresh();
                        }}
                        cellStyle={{ color: 'var(--ink)', fontSize: 12.5 }}
                      />
                      {/* NOTE — inline editable */}
                      <InlineEdit
                        value={t.note}
                        placeholder="+ เพิ่มโน้ต"
                        hint="คลิกเพื่อแก้ไขโน้ต"
                        onSave={async note => {
                          await updateTransaction(t.id, { note: note || null });
                          refresh();
                        }}
                        cellStyle={{ fontSize: 11, color: t.note ? 'var(--ink-2)' : 'var(--ink-4)' }}
                      />
                      {/* CATEGORY — inline dropdown */}
                      <InlineSelect
                        value={t.type}
                        options={allCategories.map(c => ({ value: c.id, label: c.label, icon: c.icon }))}
                        onSave={async newType => {
                          const cat = allCategories.find(c => c.id === newType);
                          await updateTransaction(t.id, { type: newType, category: cat?.label || newType });
                          refresh();
                        }}
                        onAdd={addCategory}
                      />
                      {/* AMOUNT — inline editable, preserves sign */}
                      <InlineEdit
                        value={Math.abs(Number(t.amount))}
                        type="number"
                        display={`${isIn ? '+' : ''}฿${Math.abs(Number(t.amount)).toLocaleString('th', { maximumFractionDigits: 0 })}`}
                        hint="คลิกเพื่อแก้ไขจำนวน (เครื่องหมายจะคงเดิม)"
                        onSave={async v => {
                          const sign = Number(t.amount) < 0 ? -1 : 1;
                          await updateTransaction(t.id, { amount: Math.abs(Number(v)) * sign });
                          refresh();
                        }}
                        cellStyle={{
                          textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 13,
                          color: isIn ? 'var(--profit)' : 'var(--loss)', fontWeight: 500,
                        }}
                        inputStyle={{ textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 13 }}
                      />
                      {/* ACTIONS — link recurring + delete + full-edit drawer */}
                      <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                        <button onClick={(e) => {
                          const row = e.currentTarget.closest('[data-txn-row]');
                          const rect = (row || e.currentTarget).getBoundingClientRect();
                          setLinkingTxn({ txn: t, anchorRect: rect });
                        }} title={t.recurring_id ? 'ผูกกับบิลประจำแล้ว — คลิกเพื่อเปลี่ยน' : 'ผูกกับบิลประจำ'} aria-label="ผูกบิลประจำ"
                          style={{
                            color: t.recurring_id ? 'var(--accent-strong)' : 'var(--text-muted)', fontSize: 12, background: 'none', border: 0,
                            cursor: 'pointer', padding: '4px 5px', borderRadius: 6, transition: 'all 130ms', opacity: t.recurring_id ? 1 : 0.7,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-muted)'; }}
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
                            color: 'var(--text-muted)', fontSize: 12, background: 'none', border: 0,
                            cursor: 'pointer', padding: '4px 5px', borderRadius: 6, transition: 'all 130ms',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.color = 'var(--accent-strong)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                          ⋯
                        </button>
                        <button onClick={() => { if (confirm('ลบรายการนี้?')) deleteTransaction(t.id).then(refresh); }}
                          title="ลบ" aria-label="ลบ"
                          style={{
                            color: 'var(--text-muted)', fontSize: 14, background: 'none', border: 0,
                            cursor: 'pointer', padding: '4px 6px', borderRadius: 6, transition: 'all 130ms',
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
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 4, padding: '10px 16px', borderTop: '1px solid var(--line)',
          fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)',
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
      {showAccForm && <AccountModal scope={scope} onSave={refresh} onClose={() => setShowAccForm(false)} />}
      {showGoalForm && <GoalModal scope={scope} onSave={refresh} onClose={() => setShowGoalForm(false)} />}
      {showImporter && <CSVImporter scope={scope} debts={debts} onImported={refresh} onClose={() => setShowImporter(false)} />}
    </>
  );
}

// Backward-compat default export
export function Finance() { return <FinanceView scope="personal" />; }

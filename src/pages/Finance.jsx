import { useState, useEffect, useCallback, useMemo } from 'react';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Sparkline } from '../components/Sparkline.jsx';
import { toneColor } from '../lib/helpers.js';
import {
  currentYearMonth, listTransactions, createTransaction, deleteTransaction,
  listAccounts, createAccount, deleteAccount,
  listBudgets, upsertBudget,
  listGoals, createGoal, deleteGoal,
} from '../lib/api/finance.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'food',      label: 'อาหาร',    icon: '🍜', type: 'food' },
  { id: 'transport', label: 'เดินทาง',  icon: '🚗', type: 'transport' },
  { id: 'bills',     label: 'บิล & ค่าใช้จ่าย', icon: '💡', type: 'bills' },
  { id: 'income',    label: 'รายรับ',   icon: '💰', type: 'income' },
  { id: 'shop',      label: 'ช้อปปิ้ง', icon: '🛍', type: 'shop' },
  { id: 'family',    label: 'ครอบครัว', icon: '❤️', type: 'family' },
  { id: 'other',     label: 'อื่น ๆ',   icon: '📦', type: 'other' },
];

const CAT_ICON = { food: '🍜', transport: '🚗', bills: '💡', income: '💰', shop: '🛍', family: '❤️', other: '📦' };

function fmt(n) {
  const abs = Math.abs(n);
  return (abs >= 1000 ? (abs / 1000).toFixed(1) + 'k' : abs.toLocaleString('th'));
}

function fmtFull(n) {
  return Math.abs(n).toLocaleString('th', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const thaiMonths = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${thaiMonths[m]} ${y + 543}`;
}

function txDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

// ── Add Transaction Drawer ────────────────────────────────────────────────────
function TxnForm({ accounts, onSave, onClose }) {
  const [form, setForm] = useState({
    title: '', amount: '', type: 'food', account_id: accounts[0]?.id || '',
    note: '', occurred_at: new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isIncome = form.type === 'income';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.amount) return;
    setSaving(true); setError(null);
    try {
      const amount = Number(form.amount) * (isIncome ? 1 : -1);
      await createTransaction({
        title: form.title.trim(),
        amount,
        type: form.type,
        category: CATEGORIES.find(c => c.id === form.type)?.label || form.type,
        account_id: form.account_id || null,
        note: form.note.trim() || null,
        occurred_at: form.occurred_at,
      });
      onSave();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <form onSubmit={handleSubmit} style={{
        position: 'relative', width: 440, height: '100%', background: 'var(--surface)',
        borderLeft: '1px solid var(--line)', padding: 32, overflow: 'auto',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, color: 'var(--ink)' }}>บันทึกรายการ</div>
          <button type="button" onClick={onClose} style={{ color: 'var(--ink-3)', fontSize: 18, padding: 4 }}>×</button>
        </div>

        {/* Type selector */}
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>ประเภท</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIES.map(c => (
              <button key={c.id} type="button" onClick={() => set('type', c.id)}
                style={{
                  padding: '5px 10px', borderRadius: 'var(--r-md)', fontSize: 12,
                  background: form.type === c.id ? 'var(--amber)' : 'var(--surface-2)',
                  color: form.type === c.id ? '#1a1410' : 'var(--ink-2)',
                  border: `1px solid ${form.type === c.id ? 'var(--amber)' : 'var(--line)'}`,
                }}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>รายการ</span>
          <input className="input" value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="เช่น ข้าวกลางวัน, ค่าน้ำมัน" required />
        </label>

        {/* Amount */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            จำนวน (บาท) {isIncome ? '— รายรับ (+)' : '— รายจ่าย (-)'}
          </span>
          <input className="input" type="number" min="0" step="0.01" value={form.amount}
            onChange={e => set('amount', e.target.value)} placeholder="0.00" required />
        </label>

        {/* Date */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>วันที่</span>
          <input className="input" type="date" value={form.occurred_at} onChange={e => set('occurred_at', e.target.value)} />
        </label>

        {/* Account */}
        {accounts.length > 0 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>บัญชี</span>
            <select className="input" value={form.account_id} onChange={e => set('account_id', e.target.value)}>
              <option value="">ไม่ระบุ</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}

        {/* Note */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>โน้ต (ไม่บังคับ)</span>
          <input className="input" value={form.note} onChange={e => set('note', e.target.value)} placeholder="หมายเหตุเพิ่มเติม" />
        </label>

        {error && <div style={{ padding: '10px 12px', background: 'var(--loss-bg)', color: 'var(--loss)', border: '1px solid #4a2e2a', borderRadius: 'var(--r-md)', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
          <button type="button" className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }}>ยกเลิก</button>
          <button type="submit" disabled={saving} className="btn btn--primary" style={{ flex: 2 }}>
            {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Add Account Modal ─────────────────────────────────────────────────────────
function AccountForm({ onSave, onClose }) {
  const [form, setForm] = useState({ name: '', type: 'savings', balance: '', tone: 'amber' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await createAccount({ name: form.name, type: form.type, balance: Number(form.balance) || 0, tone: form.tone });
      onSave(); onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <form onSubmit={handleSubmit} style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-xl)', padding: 32, width: 360, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>เพิ่มบัญชี</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>ชื่อบัญชี</span>
          <input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="กสิกร ออมทรัพย์" required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>ประเภท</span>
          <select className="input" value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))}>
            <option value="savings">ออมทรัพย์</option>
            <option value="checking">กระแสรายวัน</option>
            <option value="investment">การลงทุน</option>
            <option value="cash">เงินสด</option>
            <option value="crypto">คริปโต</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>ยอดเริ่มต้น (บาท)</span>
          <input className="input" type="number" value={form.balance} onChange={e => setForm(f => ({...f, balance: e.target.value}))} placeholder="0" />
        </label>
        {error && <div style={{ color: 'var(--loss)', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }}>ยกเลิก</button>
          <button type="submit" disabled={saving} className="btn btn--primary" style={{ flex: 2 }}>{saving ? '...' : 'เพิ่มบัญชี'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Add Goal Modal ────────────────────────────────────────────────────────────
function GoalForm({ onSave, onClose }) {
  const [form, setForm] = useState({ title: '', target_amount: '', current_amount: '0', deadline: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createGoal({ title: form.title, target_amount: Number(form.target_amount), current_amount: Number(form.current_amount) || 0, deadline: form.deadline || null });
      onSave(); onClose();
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <form onSubmit={handleSubmit} style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-xl)', padding: 32, width: 360, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>ตั้งเป้าหมายการเงิน</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>ชื่อเป้าหมาย</span>
          <input className="input" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="เช่น เงินดาวน์บ้าน, กองทุนฉุกเฉิน" required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>จำนวนเป้าหมาย (บาท)</span>
          <input className="input" type="number" min="1" value={form.target_amount} onChange={e => setForm(f => ({...f, target_amount: e.target.value}))} placeholder="500000" required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>มีอยู่แล้ว (บาท)</span>
          <input className="input" type="number" min="0" value={form.current_amount} onChange={e => setForm(f => ({...f, current_amount: e.target.value}))} placeholder="0" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>วันกำหนด (ถ้ามี)</span>
          <input className="input" type="date" value={form.deadline} onChange={e => setForm(f => ({...f, deadline: e.target.value}))} />
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }}>ยกเลิก</button>
          <button type="submit" disabled={saving} className="btn btn--primary" style={{ flex: 2 }}>{saving ? '...' : 'บันทึก'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function Finance() {
  const [txns, setTxns] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showTxnForm, setShowTxnForm] = useState(false);
  const [showAccForm, setShowAccForm] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);

  const yearMonth = currentYearMonth();

  const refresh = useCallback(async () => {
    try {
      const [t, a, b, g] = await Promise.all([
        listTransactions({ yearMonth }),
        listAccounts(),
        listBudgets(yearMonth),
        listGoals(),
      ]);
      setTxns(t); setAccounts(a); setBudgets(b); setGoals(g);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => { refresh(); }, [refresh]);

  // Computed stats
  const stats = useMemo(() => {
    const income = txns.filter(t => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0);
    const expense = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const net = income - expense;
    const totalBalance = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
    const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
    return { income, expense, net, totalBalance, savingsRate };
  }, [txns, accounts]);

  // Budget spending per category
  const budgetSpend = useMemo(() => {
    const spend = {};
    for (const t of txns) {
      if (t.amount < 0 && t.type) {
        spend[t.type] = (spend[t.type] || 0) + Math.abs(Number(t.amount));
      }
    }
    return spend;
  }, [txns]);

  const spendCurve = useMemo(() => {
    const byDay = {};
    for (const t of txns) {
      if (t.amount < 0) {
        const d = t.occurred_at?.split('T')[0] || '';
        byDay[d] = (byDay[d] || 0) + Math.abs(Number(t.amount));
      }
    }
    return Object.values(byDay).slice(-20);
  }, [txns]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--ink-3)' }}>
      กำลังโหลด...
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow={`${monthLabel(yearMonth)} · ${accounts.length} บัญชี`}
        title="การเงิน" em="ของบ้าน"
        sub="รายรับ-รายจ่าย, งบประมาณ, และเป้าหมายการเงิน — ดูทั้งภาพรวมและรายละเอียด"
        meta={<>
          <div>ยอดสุทธิเดือนนี้</div>
          <div className={`page-header__meta-big ${stats.net >= 0 ? 'profit' : 'loss'}`}>
            {stats.net >= 0 ? '+' : ''}฿{fmtFull(stats.net)}
          </div>
        </>}
        actions={<>
          <button className="btn btn--ghost" onClick={() => setShowAccForm(true)}>+ บัญชี</button>
          <button className="btn btn--primary" onClick={() => setShowTxnForm(true)}>
            <Icon name="plus" size={14}/> บันทึกรายการ
          </button>
        </>}
      />

      <div className="page-body">
        {error && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--loss-bg)', color: 'var(--loss)', border: '1px solid #4a2e2a', borderRadius: 'var(--r-md)' }}>{error}</div>}

        {/* Hero row: Balance + KPI stats */}
        <div className="finance-hero" style={{ marginBottom: 22 }}>
          <div className="balance-card">
            <div className="balance-card__label">มูลค่าสุทธิรวมทุกบัญชี</div>
            <div className="balance-card__value"><sup>฿</sup>{stats.totalBalance.toLocaleString('th')}</div>
            <div className="balance-card__delta">
              {stats.net >= 0 ? '▲' : '▼'} {monthLabel(yearMonth)} {stats.net >= 0 ? '+' : ''}฿{fmtFull(stats.net)} ({stats.savingsRate}% saving rate)
            </div>
            {spendCurve.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <Sparkline data={spendCurve} color="#d4a574" height={70} />
              </div>
            )}
          </div>

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 14 }}>
            <div className="card" style={{ display: 'flex', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div className="stat__label">รายรับเดือนนี้</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, color: 'var(--profit)', marginTop: 4 }}>+฿{fmt(stats.income)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="stat__label">รายจ่ายเดือนนี้</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, color: 'var(--loss)', marginTop: 4 }}>-฿{fmt(stats.expense)}</div>
              </div>
            </div>
            <div className="card">
              <div className="stat__label">Savings Rate</div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 32, marginTop: 4 }}>{stats.savingsRate}%</div>
              <div className="budget-bar" style={{ marginTop: 8 }}>
                <div className="budget-bar__fill" style={{ width: `${Math.min(stats.savingsRate, 100)}%`, background: stats.savingsRate >= 20 ? 'var(--profit)' : 'var(--amber)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Accounts + Budgets */}
        <div className="grid-2" style={{ marginBottom: 22 }}>
          {/* Accounts */}
          <div className="card">
            <div className="card__head">
              <div className="card__title">บัญชี & ทรัพย์สิน</div>
              <span className="card__label">{accounts.length} บัญชี</span>
            </div>
            {accounts.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '24px 0', fontSize: 13 }}>
                ยังไม่มีบัญชี — กด "+ บัญชี" เพื่อเพิ่ม
              </div>
            ) : (
              <div className="col" style={{ gap: 12 }}>
                {accounts.map((a, i) => (
                  <div key={a.id} className="row row--between" style={{ paddingBottom: 12, borderBottom: i < accounts.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <div className="row" style={{ gap: 10 }}>
                      <span style={{ width: 4, height: 28, borderRadius: 2, background: toneColor(a.tone) }} />
                      <div>
                        <div style={{ fontSize: 13 }}>{a.name}</div>
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' }}>{a.type}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 14, color: a.balance >= 0 ? 'var(--ink)' : 'var(--loss)' }}>
                        ฿{Number(a.balance).toLocaleString('th')}
                      </div>
                      <button onClick={() => { if (confirm('ลบบัญชีนี้?')) { deleteAccount(a.id).then(refresh); } }}
                        style={{ color: 'var(--ink-4)', fontSize: 11, padding: '2px 4px' }}>ลบ</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn--ghost" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
              onClick={() => setShowAccForm(true)}>+ เพิ่มบัญชี</button>
          </div>

          {/* Budgets */}
          <div className="card">
            <div className="card__head">
              <div className="card__title">งบประมาณ</div>
              <span className="card__label">{monthLabel(yearMonth)}</span>
            </div>
            {budgets.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '24px 0', fontSize: 13 }}>
                ยังไม่มีงบประมาณ — เพิ่มได้ในอนาคต
              </div>
            ) : (
              <div className="col" style={{ gap: 14 }}>
                {budgets.map(b => {
                  const cat = CATEGORIES.find(c => c.label === b.category || c.id === b.category);
                  const spent = budgetSpend[cat?.type || b.category] || 0;
                  const pct = Math.min(Math.round((spent / Number(b.monthly_limit)) * 100), 100);
                  const over = spent > Number(b.monthly_limit);
                  return (
                    <div key={b.id}>
                      <div className="row row--between" style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 13 }}>{cat?.icon} {b.category}</span>
                        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: over ? 'var(--loss)' : 'var(--ink-3)' }}>
                          ฿{fmt(spent)} / ฿{fmt(Number(b.monthly_limit))}
                        </span>
                      </div>
                      <div className="budget-bar">
                        <div className={`budget-bar__fill ${over ? 'budget-bar__fill--over' : ''}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Transaction log */}
        <div className="card" style={{ marginBottom: 22 }}>
          <div className="card__head">
            <div className="card__title">รายการธุรกรรม</div>
            <span className="card__label">{txns.length} รายการ · {monthLabel(yearMonth)}</span>
          </div>
          {txns.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '32px 0', fontSize: 13 }}>
              ยังไม่มีรายการเดือนนี้ — กด "+ บันทึกรายการ" เพื่อเพิ่ม
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '38px 1fr 110px 100px 40px', gap: 12, padding: '8px 12px', fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', borderBottom: '1px solid var(--line)' }}>
                <div></div><div>รายการ</div><div>ประเภท</div><div style={{ textAlign: 'right' }}>จำนวน</div><div></div>
              </div>
              {txns.map(t => {
                const isIn = t.amount > 0;
                return (
                  <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '38px 1fr 110px 100px 40px', gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--line)', alignItems: 'center', fontSize: 13 }}
                    className="txn-row">
                    <div className={`txn-icon txn-icon--${t.type || 'other'}`}>
                      {CAT_ICON[t.type] || '📦'}
                    </div>
                    <div>
                      <div className="txn-row__title">{t.title}</div>
                      <div className="txn-row__sub">{txDate(t.occurred_at)}{t.note ? ` · ${t.note}` : ''}</div>
                    </div>
                    <div className="txn-row__cat">{t.category || t.type}</div>
                    <div className={`txn-row__amount ${isIn ? 'txn-row__amount--in' : ''}`}>
                      {isIn ? '+' : ''}฿{fmtFull(t.amount)}
                    </div>
                    <button onClick={() => { if (confirm('ลบรายการนี้?')) { deleteTransaction(t.id).then(refresh); } }}
                      style={{ color: 'var(--ink-4)', fontSize: 14, padding: 4 }}>×</button>
                  </div>
                );
              })}
            </>
          )}
          <button className="btn btn--ghost" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
            onClick={() => setShowTxnForm(true)}>+ เพิ่มรายการ</button>
        </div>

        {/* Financial Goals */}
        <div className="card">
          <div className="card__head">
            <div className="card__title">เป้าหมายการเงิน</div>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowGoalForm(true)}>+ เพิ่ม</button>
          </div>
          {goals.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '24px 0', fontSize: 13 }}>
              ยังไม่มีเป้าหมาย — เช่น เงินดาวน์บ้าน, กองทุนฉุกเฉิน
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {goals.map(g => {
                const pct = Math.min(Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100), 100);
                return (
                  <div key={g.id}>
                    <div className="row row--between" style={{ marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 14, fontFamily: 'var(--f-display)' }}>{g.title}</div>
                        {g.deadline && <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>กำหนด: {new Date(g.deadline).toLocaleDateString('th-TH')}</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13 }}>฿{Number(g.current_amount).toLocaleString('th')} / ฿{Number(g.target_amount).toLocaleString('th')}</div>
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>{pct}%</div>
                      </div>
                    </div>
                    <div className="budget-bar" style={{ height: 8 }}>
                      <div className="budget-bar__fill" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--profit)' : 'var(--amber)' }} />
                    </div>
                    <button onClick={() => { if (confirm('ลบเป้าหมายนี้?')) { deleteGoal(g.id).then(refresh); } }}
                      style={{ marginTop: 6, color: 'var(--ink-4)', fontSize: 11, padding: '2px 0' }}>ลบ</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showTxnForm && <TxnForm accounts={accounts} onSave={refresh} onClose={() => setShowTxnForm(false)} />}
      {showAccForm && <AccountForm onSave={refresh} onClose={() => setShowAccForm(false)} />}
      {showGoalForm && <GoalForm onSave={refresh} onClose={() => setShowGoalForm(false)} />}
    </>
  );
}

import { useState, useEffect } from 'react';
import { Icon } from './Icon.jsx';
import { createTrade, updateTrade } from '../lib/api/trades.js';

const SETUPS = ['OB', 'FVG', 'BOS', 'CHoCH', 'Liquidity Sweep', 'OB + FVG', 'BOS + OB', 'Liq Grab + OB'];
const SESSIONS = ['ASIA', 'LDN', 'NY'];
const STATUSES = [
  { value: 'WIN', label: 'WIN', color: 'var(--profit)' },
  { value: 'LOSS', label: 'LOSS', color: 'var(--loss)' },
  { value: 'BREAKEVEN', label: 'BE', color: 'var(--ink-3)' },
  { value: 'OPEN', label: 'OPEN', color: 'var(--amber)' },
];

const today = () => new Date().toISOString().split('T')[0];
const emptyTrade = {
  trade_date: today(),
  symbol: '',
  side: 'long',
  setup: '',
  rr: '',
  pnl: '',
  status: 'WIN',
  session: 'NY',
  reason: '',
  emotion: '',
};

export function TradeForm({ open, onClose, onSaved, initialTrade }) {
  const [form, setForm] = useState(emptyTrade);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setForm(initialTrade ? {
        ...emptyTrade,
        ...initialTrade,
        trade_date: initialTrade.trade_date || today(),
        pnl: initialTrade.pnl ?? '',
      } : emptyTrade);
      setError(null);
    }
  }, [open, initialTrade]);

  if (!open) return null;

  const isEdit = !!initialTrade?.id;

  const update = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const payload = {
        trade_date: form.trade_date,
        symbol: form.symbol.toUpperCase().trim(),
        side: form.side,
        setup: form.setup.trim() || null,
        rr: form.rr.trim() || null,
        pnl: form.pnl === '' ? null : Number(form.pnl),
        status: form.status,
        session: form.session,
        reason: form.reason.trim() || null,
        emotion: form.emotion.trim() || null,
      };
      if (isEdit) await updateTrade(initialTrade.id, payload);
      else        await createTrade(payload);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <form style={s.drawer} onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div style={s.header}>
          <div>
            <div style={s.eyebrow}>{isEdit ? 'EDIT TRADE' : 'NEW TRADE'}</div>
            <div style={s.title}>{isEdit ? 'แก้ไข Trade' : 'บันทึก Trade ใหม่'}</div>
          </div>
          <button type="button" onClick={onClose} style={s.close}>✕</button>
        </div>

        <div style={s.body}>
          <div style={s.grid2}>
            <Field label="วันที่">
              <input type="date" value={form.trade_date} required
                onChange={e => update('trade_date', e.target.value)} style={s.input} />
            </Field>
            <Field label="Symbol">
              <input type="text" value={form.symbol} required placeholder="EURUSD"
                onChange={e => update('symbol', e.target.value)} style={s.input} />
            </Field>
          </div>

          <Field label="ทิศทาง">
            <div style={s.segGroup}>
              {['long', 'short'].map(side => (
                <button key={side} type="button" onClick={() => update('side', side)}
                  style={{
                    ...s.segBtn,
                    ...(form.side === side ? {
                      background: side === 'long' ? 'var(--profit-bg)' : 'var(--loss-bg)',
                      color: side === 'long' ? 'var(--profit)' : 'var(--loss)',
                      borderColor: side === 'long' ? '#2e4a37' : '#4a2e2a',
                    } : {})
                  }}>
                  {side.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Setup">
            <input type="text" value={form.setup} placeholder="OB + FVG, Liquidity Sweep, ..."
              list="setup-options"
              onChange={e => update('setup', e.target.value)} style={s.input} />
            <datalist id="setup-options">
              {SETUPS.map(s => <option key={s} value={s} />)}
            </datalist>
          </Field>

          <div style={s.grid2}>
            <Field label="R:R" hint="เช่น 1:3.2 หรือ -1">
              <input type="text" value={form.rr} placeholder="1:3.2"
                onChange={e => update('rr', e.target.value)} style={s.input} />
            </Field>
            <Field label="P&L (THB)" hint="+กำไร / -ขาดทุน">
              <input type="number" value={form.pnl} step="any" placeholder="4820"
                onChange={e => update('pnl', e.target.value)} style={s.input} />
            </Field>
          </div>

          <div style={s.grid2}>
            <Field label="ผลลัพธ์">
              <div style={s.segGroup}>
                {STATUSES.map(opt => (
                  <button key={opt.value} type="button" onClick={() => update('status', opt.value)}
                    style={{
                      ...s.segBtn,
                      flex: 1,
                      ...(form.status === opt.value ? {
                        borderColor: opt.color, color: opt.color,
                      } : {})
                    }}>{opt.label}</button>
                ))}
              </div>
            </Field>

            <Field label="Session">
              <div style={s.segGroup}>
                {SESSIONS.map(sess => (
                  <button key={sess} type="button" onClick={() => update('session', sess)}
                    style={{
                      ...s.segBtn, flex: 1,
                      ...(form.session === sess ? { borderColor: 'var(--amber)', color: 'var(--amber)' } : {})
                    }}>{sess}</button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="ทำไมเข้า trade นี้ (Why)">
            <textarea value={form.reason} rows={2} placeholder="HTF 4H bullish + OB ที่ ..."
              onChange={e => update('reason', e.target.value)} style={{ ...s.input, resize: 'vertical' }} />
          </Field>

          <Field label="ความรู้สึก (Emotion)">
            <textarea value={form.emotion} rows={2} placeholder="ใจเย็น รอ confirmation ครบก่อนเข้า"
              onChange={e => update('emotion', e.target.value)} style={{ ...s.input, resize: 'vertical' }} />
          </Field>

          {error && <div style={s.error}>{error}</div>}
        </div>

        <div style={s.footer}>
          <button type="button" onClick={onClose} style={s.btnGhost}>ยกเลิก</button>
          <button type="submit" disabled={loading} style={s.btnPrimary}>
            {loading ? 'กำลังบันทึก...' : (isEdit ? 'บันทึกการแก้ไข' : 'บันทึก Trade')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{
          fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: 'var(--ink-3)',
        }}>{label}</span>
        {hint && <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>{hint}</span>}
      </div>
      {children}
    </label>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    display: 'flex', justifyContent: 'flex-end',
  },
  drawer: {
    width: 480, maxWidth: '95vw', height: '100vh',
    background: 'var(--surface)', borderLeft: '1px solid var(--line)',
    display: 'flex', flexDirection: 'column',
    boxShadow: '-12px 0 40px rgba(0,0,0,0.4)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '24px 28px 18px', borderBottom: '1px solid var(--line)',
  },
  eyebrow: {
    fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.22em',
    textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 6,
  },
  title: { fontFamily: 'var(--f-display)', fontSize: 24, color: 'var(--ink)' },
  close: {
    background: 'transparent', border: 0, color: 'var(--ink-3)',
    fontSize: 20, cursor: 'pointer', width: 32, height: 32,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 6,
  },
  body: {
    flex: 1, padding: '20px 28px', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  input: {
    background: 'var(--bg-2)', border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)', padding: '9px 11px',
    color: 'var(--ink)', fontSize: 13.5, outline: 'none',
    fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  },
  segGroup: { display: 'flex', gap: 6 },
  segBtn: {
    flex: 1, padding: '8px 10px',
    background: 'var(--bg-2)', border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)', color: 'var(--ink-2)',
    fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.06em',
    cursor: 'pointer', transition: 'all 120ms',
  },
  footer: {
    display: 'flex', gap: 10, padding: '18px 28px',
    borderTop: '1px solid var(--line)', background: 'var(--bg-2)',
  },
  btnGhost: {
    padding: '10px 18px', borderRadius: 'var(--r-md)',
    background: 'transparent', border: '1px solid var(--line)',
    color: 'var(--ink-2)', cursor: 'pointer', fontSize: 13,
    fontFamily: 'inherit',
  },
  btnPrimary: {
    flex: 1, padding: '10px 18px', borderRadius: 'var(--r-md)',
    background: 'var(--amber)', color: '#1a1410',
    border: 0, fontWeight: 500, cursor: 'pointer', fontSize: 13,
    fontFamily: 'inherit',
  },
  error: {
    padding: '10px 12px', borderRadius: 'var(--r-md)',
    background: 'var(--loss-bg)', color: 'var(--loss)',
    border: '1px solid #4a2e2a', fontSize: 12.5,
  },
};

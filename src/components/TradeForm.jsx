import { useState, useEffect } from 'react';
import { Icon } from './Icon.jsx';
import { createTrade, updateTrade } from '../lib/api/trades.js';

// HA-50 setups ขึ้นก่อน — ของเดิม (ICT) เก็บไว้ให้แก้ trade ประวัติเก่าได้
const SETUPS = [
  'HA Flip + EMA50', 'HA Flip · ย่อ 2 แท่ง', 'HA Flip · ไส้สั้น',
  'OB', 'FVG', 'BOS', 'CHoCH', 'Liquidity Sweep', 'OB + FVG', 'BOS + OB', 'Liq Grab + OB',
];
const SESSIONS = ['London–NY', 'LDN', 'NY', 'ASIA'];
const STATUSES = [
  { value: 'WIN', label: 'WIN', color: 'var(--profit)' },
  { value: 'LOSS', label: 'LOSS', color: 'var(--loss)' },
  { value: 'BREAKEVEN', label: 'BE', color: 'var(--ink-3)' },
  { value: 'OPEN', label: 'OPEN', color: 'var(--amber)' },
];

const today = () => new Date().toISOString().split('T')[0];
const emptyTrade = {
  trade_date: today(),
  symbol: 'XAUUSD',
  side: 'long',
  setup: '',
  entry_price: '',
  exit_price: '',
  stop_loss: '',
  take_profit: '',
  position_size: '',
  rr: '',
  r_multiple: '',
  pnl: '',
  pnl_pct: '',
  balance_after: '',
  status: 'WIN',
  session: 'London–NY',
  system: 'HA-50',
  followed_rules: true,
  rule_broken: '',
  setup_detail: '',
  emotion: '',
  lesson_learned: '',
  reason: '',
};

/**
 * R ที่ได้จริง — long: (exit−entry)/(entry−SL) · short: (entry−exit)/(SL−entry)
 * คืน null ถ้ากรอกไม่ครบ หรือ risk = 0 (กัน divide-by-zero)
 */
function computeR(side, entry, exit, sl) {
  const e = Number(entry), x = Number(exit), s = Number(sl);
  if (![e, x, s].every(Number.isFinite)) return null;
  if (entry === '' || exit === '' || sl === '') return null;
  const risk   = side === 'short' ? s - e : e - s;
  const reward = side === 'short' ? e - x : x - e;
  if (!risk) return null;
  const r = reward / risk;
  if (!Number.isFinite(r)) return null;
  return Math.round(r * 100) / 100;
}

/** null/undefined → '' เพื่อไม่ให้ input หลุดเป็น uncontrolled */
const str = (v) => (v == null ? '' : String(v));

export function TradeForm({ open, onClose, onSaved, initialTrade }) {
  const [form, setForm] = useState(emptyTrade);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // true = ผู้ใช้พิมพ์ R เอง → หยุด auto-compute
  const [rManual, setRManual] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialTrade ? {
        ...emptyTrade,
        ...initialTrade,
        trade_date:     initialTrade.trade_date || today(),
        setup:          str(initialTrade.setup),
        rr:             str(initialTrade.rr),
        pnl:            str(initialTrade.pnl),
        entry_price:    str(initialTrade.entry_price),
        exit_price:     str(initialTrade.exit_price),
        stop_loss:      str(initialTrade.stop_loss),
        r_multiple:     str(initialTrade.r_multiple),
        session:        initialTrade.session || 'London–NY',
        system:         str(initialTrade.system),
        followed_rules: initialTrade.followed_rules ?? true,
        rule_broken:    str(initialTrade.rule_broken),
        reason:         str(initialTrade.reason),
        emotion:        str(initialTrade.emotion),
      } : emptyTrade);
      setRManual(initialTrade?.r_multiple != null);
      setError(null);
    }
  }, [open, initialTrade]);

  const autoR = computeR(form.side, form.entry_price, form.exit_price, form.stop_loss);

  useEffect(() => {
    if (rManual) return;
    const nextVal = autoR == null ? '' : String(autoR);
    setForm(prev => (str(prev.r_multiple) === nextVal ? prev : { ...prev, r_multiple: nextVal }));
  }, [autoR, rManual]);

  if (!open) return null;

  const isEdit = !!initialTrade?.id;

  const update = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const num = (v) => (v === '' || v == null ? null : Number(v));
      const payload = {
        trade_date: form.trade_date,
        symbol: form.symbol.toUpperCase().trim(),
        side: form.side,
        setup: form.setup.trim() || null,
        rr: form.rr.trim() || null,
        entry_price: num(form.entry_price),
        exit_price: num(form.exit_price),
        stop_loss: num(form.stop_loss),
        r_multiple: num(form.r_multiple),
        pnl: num(form.pnl),
        status: form.status,
        session: form.session,
        // trade เก่า (ICT) ที่ยังไม่มี system ให้คงค่าเดิมไว้ — ไม่ดึงเข้า mission เอง
        system: isEdit ? (form.system.trim() || null) : (form.system.trim() || 'HA-50'),
        followed_rules: !!form.followed_rules,
        rule_broken: form.followed_rules ? null : (form.rule_broken.trim() || null),
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
            <div style={s.eyebrow}>{isEdit ? 'EDIT TRADE' : 'NEW TRADE · HA-50 DEMO'}</div>
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
              <input type="text" value={form.symbol} required placeholder="XAUUSD"
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
            <input type="text" value={form.setup} placeholder="HA Flip + EMA50, ..."
              list="setup-options"
              onChange={e => update('setup', e.target.value)} style={s.input} />
            <datalist id="setup-options">
              {SETUPS.map(s => <option key={s} value={s} />)}
            </datalist>
          </Field>

          <div style={{ ...s.grid2, gridTemplateColumns: '1fr 1fr 1fr' }}>
            <Field label="Entry">
              <input type="number" value={form.entry_price} step="any" placeholder="2650.40"
                onChange={e => update('entry_price', e.target.value)} style={s.input} />
            </Field>
            <Field label="SL">
              <input type="number" value={form.stop_loss} step="any" placeholder="2644.00"
                onChange={e => update('stop_loss', e.target.value)} style={s.input} />
            </Field>
            <Field label="Exit">
              <input type="number" value={form.exit_price} step="any" placeholder="2663.10"
                onChange={e => update('exit_price', e.target.value)} style={s.input} />
            </Field>
          </div>

          <div style={{ ...s.grid2, gridTemplateColumns: '1.2fr 1fr' }}>
            <Field label="R ที่ได้" hint={rManual ? 'กรอกเอง' : autoR == null ? 'คิดจาก Entry/SL/Exit' : 'คิดให้อัตโนมัติ'}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="number" value={form.r_multiple} step="any" placeholder="เช่น 1.85 หรือ -1"
                  onChange={e => { setRManual(true); update('r_multiple', e.target.value); }}
                  style={{ ...s.input, fontFamily: 'var(--f-mono)' }} />
                {rManual && (
                  <button type="button" onClick={() => setRManual(false)}
                    title="กลับไปคิดอัตโนมัติ"
                    style={{ ...s.btnGhost, padding: '9px 10px', fontSize: 12, flexShrink: 0 }}>↻</button>
                )}
              </div>
            </Field>
            <Field label="P&L (USD)" hint="+กำไร / -ขาดทุน">
              <input type="number" value={form.pnl} step="any" placeholder="48.20"
                onChange={e => update('pnl', e.target.value)} style={s.input} />
            </Field>
          </div>

          <Field label="R:R ที่วางแผน" hint="เช่น 1:3.2 (ไม่บังคับ)">
            <input type="text" value={form.rr} placeholder="1:3.2"
              onChange={e => update('rr', e.target.value)} style={s.input} />
          </Field>

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

          <Field label="ทำตามกติกาไหม" hint="ตัวชี้วัดหลักของภารกิจ">
            <div style={s.segGroup}>
              {[
                { val: true,  label: 'ใช่ · ทำตามครบ' },
                { val: false, label: 'ไม่ · แหกกติกา' },
              ].map(opt => (
                <button key={String(opt.val)} type="button" onClick={() => update('followed_rules', opt.val)}
                  style={{
                    ...s.segBtn, flex: 1,
                    ...(form.followed_rules === opt.val ? {
                      borderColor: opt.val ? 'var(--profit)' : 'var(--loss)',
                      color: opt.val ? 'var(--profit)' : 'var(--loss)',
                    } : {})
                  }}>{opt.label}</button>
              ))}
            </div>
          </Field>

          {!form.followed_rules && (
            <Field label="ผิดกติกาข้อไหน">
              <input type="text" value={form.rule_broken} placeholder="เช่น เข้าก่อนแท่งปิด / ปิดก่อน HA เปลี่ยนสี / เพิ่ม lot"
                onChange={e => update('rule_broken', e.target.value)} style={s.input} />
            </Field>
          )}

          <Field label="ทำไมเข้า trade นี้ (Why)">
            <textarea value={form.reason} rows={2} placeholder="EMA50 ชันขึ้น · ย่อ 2 แท่งแดง · HA กลับเป็นเขียวและปิดแท่งแล้ว"
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

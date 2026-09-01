import { useState, useEffect } from 'react';
import { Card, CardHeader, Button, Badge } from '../ui/index.js';
import { createScopeTransfer, listAccounts } from '../../lib/api/finance.js';
import { todayStr } from '../../lib/dates.js';
import { Icon } from '../Icon.jsx';

const SCOPE_META = {
  personal: { label: 'ส่วนตัว',  icon: '👤', color: 'var(--accent-strong)' },
  family:   { label: 'ครอบครัว', icon: '❤️', color: 'var(--violet)' },
};

export function ScopeTransferModal({ defaultFromScope = 'personal', onSaved, onClose }) {
  const [fromScope, setFromScope] = useState(defaultFromScope);
  const [toScope,   setToScope]   = useState(defaultFromScope === 'personal' ? 'family' : 'personal');
  const [amount,    setAmount]    = useState('');
  const [date,      setDate]      = useState(todayStr());
  const [title,     setTitle]     = useState('');
  const [note,      setNote]      = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);
  // Batch C · B5: each leg records its own account endpoint, so a transfer is
  // visible in the balances it actually moves. Optional — "ไม่ระบุบัญชี"
  // reproduces the previous behaviour exactly (account_id stays null).
  const [accounts,  setAccounts]  = useState([]);
  const [fromAcct,  setFromAcct]  = useState('');
  const [toAcct,    setToAcct]    = useState('');

  useEffect(() => {
    let alive = true;
    listAccounts()
      .then(rows => { if (alive) setAccounts(rows || []); })
      .catch(() => { if (alive) setAccounts([]); });   // pickers just stay empty
    return () => { alive = false; };
  }, []);
  const acctsIn = (sc) => accounts.filter(a => (a.scope || 'personal') === sc);

  const fromMeta = SCOPE_META[fromScope];
  const toMeta   = SCOPE_META[toScope];

  const swap = () => {
    setFromScope(toScope);
    setToScope(fromScope);
    setFromAcct(toAcct);
    setToAcct(fromAcct);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) { setError('ใส่จำนวนเงิน'); return; }
    setSaving(true); setError(null);
    try {
      await createScopeTransfer({
        from_scope: fromScope,
        to_scope:   toScope,
        amount:     Number(amount),
        occurred_at: date,
        title:      title.trim() || null,
        note:       note.trim() || null,
        from_account_id: fromAcct || null,
        to_account_id:   toAcct   || null,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  const amt = Number(amount) || 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
      <form onSubmit={handleSubmit} style={{
        position: 'relative', width: '90vw', maxWidth: 520,
        background: 'var(--surface)',
        borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)',
        padding: 28, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>
              <Icon name="transfer" size={14} /> โอนข้าม scope
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, color: 'var(--text-primary)', marginTop: 4, fontWeight: 600, letterSpacing: '-0.01em' }}>
              โอนเงินระหว่าง scope
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
              สร้าง 2 transactions อัตโนมัติ — ออกจากฝั่งหนึ่ง · เข้าอีกฝั่ง
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด"
            style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', padding: 4 }}>×</button>
        </div>

        {/* Direction visualization */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', background: 'var(--background-soft)',
          border: '1px solid var(--hairline)', borderRadius: 'var(--radius-control)',
        }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>จาก</div>
            <div style={{ fontSize: 22, marginTop: 4 }}>{fromMeta.icon}</div>
            <Badge tone="danger" size="sm" style={{ marginTop: 4 }}>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>-{fmt(amt)}</span>
            </Badge>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, color: fromMeta.color, fontWeight: 500, marginTop: 4 }}>
              {fromMeta.label}
            </div>
          </div>

          <button type="button" onClick={swap} title="สลับทิศทาง" aria-label="สลับทิศทาง"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--surface)', border: '1px solid var(--border-strong)',
              cursor: 'pointer', fontSize: 16, color: 'var(--accent-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 130ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.transform = 'rotate(180deg)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.transform = 'rotate(0deg)'; }}>
            →
          </button>

          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>ไป</div>
            <div style={{ fontSize: 22, marginTop: 4 }}>{toMeta.icon}</div>
            <Badge tone="success" size="sm" style={{ marginTop: 4 }}>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>+{fmt(amt)}</span>
            </Badge>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, color: toMeta.color, fontWeight: 500, marginTop: 4 }}>
              {toMeta.label}
            </div>
          </div>
        </div>

        {/* Amount */}
        <Field label="จำนวนเงิน (บาท)">
          <input type="number" min="0" step="0.01" value={amount}
            onChange={e => setAmount(e.target.value)} placeholder="80000"
            autoFocus required
            onFocus={focusRing} onBlur={blurRing}
            style={{ ...inputStyle, fontFamily: 'var(--f-mono)', fontSize: 16 }} />
        </Field>

        {/* Date */}
        <Field label="วันที่">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            onFocus={focusRing} onBlur={blurRing}
            style={{ ...inputStyle, fontFamily: 'var(--f-mono)' }} />
        </Field>

        {/* Account endpoints — optional; each leg records its own side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label={`บัญชีต้นทาง (${fromMeta.label}) · optional`}>
            <select value={fromAcct} onChange={e => setFromAcct(e.target.value)}
              onFocus={focusRing} onBlur={blurRing} style={inputStyle}>
              <option value="">ไม่ระบุบัญชี</option>
              {acctsIn(fromScope).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label={`บัญชีปลายทาง (${toMeta.label}) · optional`}>
            <select value={toAcct} onChange={e => setToAcct(e.target.value)}
              onFocus={focusRing} onBlur={blurRing} style={inputStyle}>
              <option value="">ไม่ระบุบัญชี</option>
              {acctsIn(toScope).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>

        {/* Title — optional, has smart defaults */}
        <Field label='ชื่อรายการ (ปล่อยว่างก็ได้ — auto: "โอนไปครอบครัว" / "รับจากส่วนตัว")'>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder='เช่น "โอนงบครอบครัว มิ.ย."'
            onFocus={focusRing} onBlur={blurRing}
            style={inputStyle} />
        </Field>

        {/* Note — optional */}
        <Field label="โน้ต (ถ้ามี)">
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="หมายเหตุเพิ่มเติม"
            onFocus={focusRing} onBlur={blurRing}
            style={inputStyle} />
        </Field>

        {/* Preview */}
        {amt > 0 && (
          <div style={{ fontVariantNumeric: 'tabular-nums',
            padding: '10px 14px', background: 'var(--accent-soft)',
            border: '1px solid var(--accent)', borderRadius: 'var(--radius-control)',
            fontSize: 11.5, color: 'var(--text-primary)',
            lineHeight: 1.7
          }}>
            <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--accent-strong)', marginBottom: 4 }}>
              จะสร้าง 2 รายการ:
            </div>
            <div><Icon name="user" size={13} /> <strong>{fromMeta.label}</strong> · -{fmt(amt)} · "{title.trim() || `โอนไป${toMeta.label}`}"</div>
            <div><Icon name="health" size={13} /> <strong>{toMeta.label}</strong> · +{fmt(amt)} · "{title.trim() || `รับจาก${fromMeta.label}`}"</div>
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-control)', fontSize: 13 }}>
            <Icon name="warning" size={13} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Button type="button" variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" variant="primary" disabled={saving || !amount}>
            {saving ? 'กำลังบันทึก...' : 'โอน 2 ฝั่ง'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  background: 'var(--fill)', border: 'none',
  borderRadius: 'var(--radius-field)', padding: '10px 12px',
  color: 'var(--text-primary)', fontSize: 13, width: '100%',
};

const focusRing = (e) => { e.target.style.boxShadow = '0 0 0 3px var(--accent-tint)'; };
const blurRing = (e) => { e.target.style.boxShadow = 'none'; };

function fmt(n) {
  if (!n) return '฿0';
  return '฿' + Math.abs(n).toLocaleString('th', { maximumFractionDigits: 0 });
}

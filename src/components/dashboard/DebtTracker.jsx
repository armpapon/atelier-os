import { useState, useMemo } from 'react';
import { Card, CardHeader, Badge, Button, EmptyState } from '../ui/index.js';
import {
  summarizeDebts, forecastDebts, recordDebtPayment, deleteDebtPayment, deleteDebt,
} from '../../lib/api/finance.js';

const TYPE_META = {
  loan:         { icon: '🏦', label: 'สินเชื่อ' },
  credit_card:  { icon: '💳', label: 'บัตรเครดิต' },
  mortgage:     { icon: '🏠', label: 'บ้าน' },
  lease:        { icon: '🚗', label: 'เช่าซื้อ' },
  installment:  { icon: '📅', label: 'ผ่อน' },
  other:        { icon: '◇',  label: 'อื่น ๆ' },
};

const STATUS_META = {
  paid:     { label: 'จ่ายแล้ว', tone: 'success', icon: '✓' },
  pending:  { label: 'รอจ่าย',   tone: 'warning', icon: '◷' },
  overdue:  { label: 'เกินกำหนด', tone: 'danger',  icon: '!' },
  upcoming: { label: 'อนาคต',    tone: 'neutral', icon: '…' },
};

function fmt(n) {
  if (!n && n !== 0) return '฿0';
  return '฿' + Number(n).toLocaleString('th', { maximumFractionDigits: 0 });
}

// ════════════════════════════════════════════════════════════════════════════
//  Main DebtTracker
// ════════════════════════════════════════════════════════════════════════════
export function DebtTracker({ debts, payments, yearMonth, scope, onChange }) {
  const [showAdd, setShowAdd]   = useState(false);
  const [editing, setEditing]   = useState(null);
  const [showForecast, setShowForecast] = useState(false);

  const summary  = useMemo(() => summarizeDebts(debts, payments, yearMonth), [debts, payments, yearMonth]);
  const forecast = useMemo(() => forecastDebts(debts, 12),                    [debts]);

  // Mark paid handler
  const markPaid = async (debt) => {
    const monthDate = yearMonth + '-01';
    try {
      await recordDebtPayment({
        debt_id: debt.id, pay_month: monthDate,
        amount_paid: Number(debt.monthly_payment),
      });
      onChange?.();
    } catch (e) { alert('บันทึกไม่สำเร็จ: ' + e.message); }
  };

  const unmarkPaid = async (paymentId) => {
    if (!confirm('ยกเลิกบันทึกการจ่ายนี้?')) return;
    try { await deleteDebtPayment(paymentId); onChange?.(); }
    catch (e) { alert('ยกเลิกไม่สำเร็จ: ' + e.message); }
  };

  const handleDelete = async (debt) => {
    if (!confirm(`ลบหนี้สิน "${debt.name}"?\n(บันทึกการจ่ายทั้งหมดของหนี้นี้จะถูกลบด้วย)`)) return;
    try { await deleteDebt(debt.id); onChange?.(); }
    catch (e) { alert('ลบไม่สำเร็จ: ' + e.message); }
  };

  return (
    <Card>
      <CardHeader
        eyebrow={`💳 หนี้สิน & ผ่อนชำระ · ${debts.length} รายการ`}
        title="Debt Tracker"
        meta={debts.length > 0 ? `ภาระต่อเดือน ${fmt(summary.monthlyBurden)}` : null}
        action={
          <div style={{ display: 'flex', gap: 6 }}>
            {debts.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowForecast(s => !s)}>
                {showForecast ? '× Forecast' : '📊 Forecast'}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)}>+ เพิ่ม</Button>
          </div>
        }
      />

      {/* Summary stats */}
      {debts.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
          padding: 12, marginBottom: 14,
          background: 'var(--background-soft)', borderRadius: 'var(--radius-control)',
          border: '1px solid var(--border)',
        }}>
          <StatTile label="จ่ายแล้ว"   value={summary.paidCount}    color="var(--success)" sub={fmt(summary.paidThisMonth)} />
          <StatTile label="รอจ่าย"     value={summary.pendingCount} color="var(--warning)" sub={fmt(summary.pending)} />
          <StatTile label="เกินกำหนด"  value={summary.overdueCount} color="var(--danger)"  sub={fmt(summary.overdue)} />
          <StatTile label="คงเหลือรวม" value={fmt(summary.totalRemaining)} color="var(--text-primary)"
            sub={summary.maxMonthsRemaining > 0 ? `~${summary.maxMonthsRemaining} เดือน` : ''} small />
        </div>
      )}

      {/* Add/edit form */}
      {showAdd && (
        <DebtForm scope={scope} onSubmit={async () => { setShowAdd(false); onChange?.(); }} onCancel={() => setShowAdd(false)} />
      )}
      {editing && (
        <DebtForm initial={editing} scope={scope} onSubmit={async () => { setEditing(null); onChange?.(); }} onCancel={() => setEditing(null)} />
      )}

      {/* Empty state */}
      {debts.length === 0 && !showAdd ? (
        <EmptyState
          icon="💳"
          title="ยังไม่มีรายการหนี้สิน"
          description="เพิ่มหนี้สินที่ผ่อนรายเดือน (บัตรเครดิต ผ่อนรถ บ้าน) เพื่อ track ว่าจ่ายหรือยัง และ forecast วันปลอดหนี้"
          actionLabel="เพิ่มหนี้สินแรก"
          onAction={() => setShowAdd(true)}
          compact
        />
      ) : (
        /* Debt list */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {summary.statuses.map(({ debt, status }) => (
            <DebtRow
              key={debt.id}
              debt={debt}
              status={status}
              onMarkPaid={() => markPaid(debt)}
              onUnmark={() => unmarkPaid(status.payment_id)}
              onEdit={() => setEditing(debt)}
              onDelete={() => handleDelete(debt)}
            />
          ))}
        </div>
      )}

      {/* Forecast — 12 months */}
      {showForecast && debts.length > 0 && (
        <div style={{
          marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)',
        }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.16em', marginBottom: 8 }}>
            📊 FORECAST · 12 เดือนข้างหน้า
          </div>
          <ForecastChart data={forecast} />
        </div>
      )}
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Debt Row
// ════════════════════════════════════════════════════════════════════════════
function DebtRow({ debt, status, onMarkPaid, onUnmark, onEdit, onDelete }) {
  const typeMeta   = TYPE_META[debt.type]      || TYPE_META.other;
  const statusMeta = STATUS_META[status.status] || STATUS_META.upcoming;
  const monthsRemaining = debt.total_months
    ? Math.max(0, Number(debt.total_months) - Number(debt.months_paid || 0))
    : null;
  const progressPct = debt.total_months
    ? Math.min(100, (Number(debt.months_paid || 0) / Number(debt.total_months)) * 100)
    : 0;

  return (
    <div style={{
      padding: '12px 14px',
      background: status.status === 'overdue' ? 'var(--danger-soft)' :
                  status.status === 'paid'    ? 'var(--success-soft)' : 'var(--surface)',
      border: '1px solid ' + (
        status.status === 'overdue' ? 'var(--danger)' :
        status.status === 'paid'    ? 'var(--success)' : 'var(--border)'
      ),
      borderRadius: 'var(--radius-control)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Top row: name + amount + status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 18 }}>{typeMeta.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13.5, color: 'var(--text-primary)', fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{debt.name}</div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
              {typeMeta.label} · ครบกำหนดทุกวันที่ {debt.due_day || 5}
              {debt.creditor && ` · ${debt.creditor}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
            {fmt(debt.monthly_payment)}<span style={{ fontSize: 10, color: 'var(--text-muted)' }}>/เดือน</span>
          </div>
          <Badge tone={statusMeta.tone} size="sm">
            <span style={{ marginRight: 4 }}>{statusMeta.icon}</span>{statusMeta.label}
          </Badge>
        </div>
      </div>

      {/* Progress bar — only if we know total_months */}
      {debt.total_months && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', marginBottom: 4 }}>
            <span>{debt.months_paid || 0} / {debt.total_months} งวด</span>
            <span>
              {progressPct.toFixed(0)}%
              {monthsRemaining > 0 && ` · เหลือ ${monthsRemaining} เดือน`}
              {monthsRemaining === 0 && ' · ปลอดหนี้!'}
            </span>
          </div>
          <div style={{ height: 5, background: 'var(--surface-muted)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${progressPct}%`, height: '100%',
              background: progressPct >= 100 ? 'var(--success)' : 'var(--accent)',
              transition: 'width 300ms',
            }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {status.status === 'paid' ? (
          <Button variant="ghost" size="sm" onClick={onUnmark}>
            ✓ จ่ายแล้วเมื่อ {new Date(status.paid_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} · ยกเลิก
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={onMarkPaid}>
            ✓ บันทึกว่าจ่ายแล้ว
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onEdit}>แก้ไข</Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>ลบ</Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Add/Edit Debt Form
// ════════════════════════════════════════════════════════════════════════════
function DebtForm({ initial, scope, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name:            initial?.name            || '',
    creditor:        initial?.creditor        || '',
    monthly_payment: initial?.monthly_payment || '',
    due_day:         initial?.due_day         || 5,
    total_months:    initial?.total_months    || '',
    months_paid:     initial?.months_paid     || 0,
    type:            initial?.type            || 'loan',
    start_date:      initial?.start_date      || '',
    notes:           initial?.notes           || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.monthly_payment) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        monthly_payment: Number(form.monthly_payment),
        due_day:         Number(form.due_day) || 5,
        total_months:    form.total_months ? Number(form.total_months) : null,
        months_paid:     Number(form.months_paid) || 0,
        start_date:      form.start_date || null,
        scope,
      };
      if (initial) {
        const { updateDebt } = await import('../../lib/api/finance.js');
        await updateDebt(initial.id, payload);
      } else {
        const { createDebt } = await import('../../lib/api/finance.js');
        await createDebt(payload);
      }
      onSubmit();
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  const inputStyle = {
    background: 'var(--surface)', border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-control)', padding: '8px 11px',
    color: 'var(--text-primary)', fontSize: 12.5,
  };

  return (
    <form onSubmit={submit} style={{
      background: 'var(--background-soft)', border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-control)', padding: 14,
      display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12,
    }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.16em' }}>
        {initial ? 'แก้ไขหนี้สิน' : 'เพิ่มหนี้สินใหม่'}
      </div>

      <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
        placeholder="ชื่อ เช่น 'BMW Leasing' หรือ 'KTC บัตรเครดิต'" required style={inputStyle} />

      <input type="text" value={form.creditor} onChange={e => set('creditor', e.target.value)}
        placeholder="ผู้รับชำระ (ถ้ามีในรายการธุรกรรม จะ match อัตโนมัติ)" style={inputStyle} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 6 }}>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', display: 'block', marginBottom: 3 }}>ค่างวด/เดือน (฿)</label>
          <input type="number" min="0" step="0.01" value={form.monthly_payment}
            onChange={e => set('monthly_payment', e.target.value)} placeholder="19253" required
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)' }} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', display: 'block', marginBottom: 3 }}>ครบกำหนด</label>
          <input type="number" min="1" max="31" value={form.due_day}
            onChange={e => set('due_day', e.target.value)} required
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)' }} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', display: 'block', marginBottom: 3 }}>งวดทั้งหมด</label>
          <input type="number" min="0" value={form.total_months}
            onChange={e => set('total_months', e.target.value)} placeholder="60"
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', display: 'block', marginBottom: 3 }}>จ่ายไปแล้วกี่งวด</label>
          <input type="number" min="0" value={form.months_paid}
            onChange={e => set('months_paid', e.target.value)}
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)' }} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', display: 'block', marginBottom: 3 }}>เริ่มผ่อน</label>
          <input type="date" value={form.start_date}
            onChange={e => set('start_date', e.target.value)}
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)', color: 'var(--text-secondary)' }} />
        </div>
      </div>

      {/* Type chips */}
      <div>
        <label style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', display: 'block', marginBottom: 5 }}>ประเภท</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {Object.entries(TYPE_META).map(([k, m]) => (
            <button key={k} type="button" onClick={() => set('type', k)} className="focus-ring"
              style={{
                padding: '4px 10px', borderRadius: 'var(--radius-pill)', fontSize: 11, cursor: 'pointer',
                background: form.type === k ? 'var(--accent-soft)' : 'var(--surface)',
                color: form.type === k ? 'var(--accent-strong)' : 'var(--text-secondary)',
                border: `1px solid ${form.type === k ? 'var(--accent)' : 'var(--border)'}`,
                fontFamily: 'var(--f-mono)',
              }}>{m.icon} {m.label}</button>
          ))}
        </div>
      </div>

      <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)}
        placeholder="หมายเหตุ (ถ้ามี)" style={inputStyle} />

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" variant="primary" size="sm" disabled={saving}>
          {saving ? '...' : (initial ? '💾 บันทึก' : '+ เพิ่มหนี้สิน')}
        </Button>
      </div>
    </form>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Stat Tile
// ════════════════════════════════════════════════════════════════════════════
function StatTile({ label, value, color, sub, small }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{
        fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--text-muted)',
        letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{
        fontFamily: 'var(--f-display)', fontSize: small ? 17 : 22, fontWeight: 500,
        color, lineHeight: 1.1,
      }}>{value}</div>
      {sub && (
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  12-month Forecast mini-chart (bars)
// ════════════════════════════════════════════════════════════════════════════
const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function ForecastChart({ data }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d.outflow), 1);

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginBottom: 8,
        fontSize: 11, color: 'var(--text-secondary)',
      }}>
        <span>ภาระต่อเดือนเริ่มลดลงเมื่อหนี้แต่ละก้อนผ่อนหมด</span>
        <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--text-muted)' }}>
          สูงสุด ฿{Math.round(max).toLocaleString('th')}/เดือน
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80 }}>
        {data.map((d, i) => {
          const h = (d.outflow / max) * 100;
          const [, m] = d.ym.split('-').map(Number);
          return (
            <div key={d.ym} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div title={`${d.ym}: ฿${Math.round(d.outflow).toLocaleString('th')} (${d.activeCount} หนี้)`} style={{
                width: '100%', height: `${h}%`, minHeight: 2,
                background: i === 0 ? 'var(--accent)' : 'var(--accent-soft)',
                borderRadius: '3px 3px 0 0', transition: 'all 200ms',
              }} />
              <div style={{
                fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)',
                fontWeight: i === 0 ? 600 : 400,
              }}>{THAI_MONTHS_SHORT[m - 1]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

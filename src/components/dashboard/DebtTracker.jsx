import { useState, useMemo } from 'react';
import { Card, CardHeader, Badge, Button, EmptyState } from '../ui/index.js';
import {
  summarizeDebts, forecastDebts, recordDebtPayment, deleteDebtPayment, deleteDebt,
  calculateDebtMath, simulatePayoff,
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
  const [showAdd, setShowAdd]       = useState(false);
  const [editing, setEditing]       = useState(null);
  const [showForecast, setShowForecast] = useState(false);
  const [showStrategy, setShowStrategy] = useState(false);

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
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {debts.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => setShowStrategy(s => !s)}>
                {showStrategy ? '× Strategy' : '⚡ โปะหนี้'}
              </Button>
            )}
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

      {/* Add form (shows at top — only for new debts) */}
      {showAdd && (
        <DebtForm scope={scope} onSubmit={async () => { setShowAdd(false); onChange?.(); }} onCancel={() => setShowAdd(false)} />
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
        /* Debt list — edit form renders inline below the active row */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {summary.statuses.map(({ debt, status }) => (
            <div key={debt.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <DebtRow
                debt={debt}
                status={status}
                isEditing={editing?.id === debt.id}
                onMarkPaid={() => markPaid(debt)}
                onUnmark={() => unmarkPaid(status.payment_id)}
                onEdit={() => setEditing(editing?.id === debt.id ? null : debt)}
                onDelete={() => handleDelete(debt)}
              />
              {editing?.id === debt.id && (
                <DebtForm
                  initial={editing}
                  scope={scope}
                  onSubmit={async () => { setEditing(null); onChange?.(); }}
                  onCancel={() => setEditing(null)}
                />
              )}
            </div>
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

      {/* Strategy comparison */}
      {showStrategy && debts.length > 1 && (
        <DebtStrategyCard debts={debts} />
      )}
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Debt Row
// ════════════════════════════════════════════════════════════════════════════
function DebtRow({ debt, status, isEditing, onMarkPaid, onUnmark, onEdit, onDelete }) {
  const typeMeta   = TYPE_META[debt.type]      || TYPE_META.other;
  const statusMeta = STATUS_META[status.status] || STATUS_META.upcoming;
  const monthsRemaining = debt.total_months
    ? Math.max(0, Number(debt.total_months) - Number(debt.months_paid || 0))
    : null;
  const progressPct = debt.total_months
    ? Math.min(100, (Number(debt.months_paid || 0) / Number(debt.total_months)) * 100)
    : 0;
  const math = calculateDebtMath(debt);

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

      {/* Interest breakdown — only if interest_rate set */}
      {math.hasInterestData && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
          padding: '8px 10px', background: 'var(--background-soft)',
          borderRadius: 'var(--radius-control)', border: '1px solid var(--border)',
          fontSize: 10.5, fontFamily: 'var(--f-mono)',
        }}>
          <MiniStat label="เงินต้น" value={fmt(math.principal)} color="var(--text-primary)" />
          <MiniStat label="ดอกเบี้ยรวม" value={fmt(math.totalInterest)} color="var(--danger)"
            sub={`${((math.totalInterest / math.totalPaid) * 100).toFixed(0)}% ของจ่ายรวม`} />
          <MiniStat label="ดอกเบี้ยที่เหลือ" value={fmt(math.remainingInterest)} color="var(--accent-strong)"
            sub={`${Number(debt.interest_rate).toFixed(2)}% ต่อปี`} />
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
        <Button variant="ghost" size="sm" onClick={onEdit}>{isEditing ? '× ปิด' : 'แก้ไข'}</Button>
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
    name:               initial?.name               || '',
    creditor:           initial?.creditor           || '',
    monthly_payment:    initial?.monthly_payment    || '',
    due_day:            initial?.due_day            || 5,
    total_months:       initial?.total_months       || '',
    months_paid:        initial?.months_paid        || 0,
    interest_rate:      initial?.interest_rate      || '',
    original_principal: initial?.original_principal || '',
    type:               initial?.type               || 'loan',
    start_date:         initial?.start_date         || '',
    notes:              initial?.notes              || '',
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
        monthly_payment:    Number(form.monthly_payment),
        due_day:            Number(form.due_day) || 5,
        total_months:       form.total_months       ? Number(form.total_months)       : null,
        months_paid:        Number(form.months_paid) || 0,
        interest_rate:      form.interest_rate      ? Number(form.interest_rate)      : null,
        original_principal: form.original_principal ? Number(form.original_principal) : null,
        start_date:         form.start_date || null,
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

      {/* Interest rate + original principal — optional for interest math */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', display: 'block', marginBottom: 3 }}>
            ดอกเบี้ยต่อปี (%) <span style={{ color: 'var(--text-muted)' }}>· optional</span>
          </label>
          <input type="number" min="0" step="0.01" value={form.interest_rate}
            onChange={e => set('interest_rate', e.target.value)} placeholder="5.5"
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)' }} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', display: 'block', marginBottom: 3 }}>
            เงินต้น (฿) <span style={{ color: 'var(--text-muted)' }}>· optional</span>
          </label>
          <input type="number" min="0" step="0.01" value={form.original_principal}
            onChange={e => set('original_principal', e.target.value)} placeholder="1000000"
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)' }} />
        </div>
      </div>
      {(form.interest_rate || form.original_principal) && (
        <div style={{
          padding: '8px 12px', background: 'var(--accent-soft)',
          borderRadius: 'var(--radius-control)', fontSize: 11, color: 'var(--accent-strong)',
          fontFamily: 'var(--f-mono)',
        }}>
          💡 ใส่อย่างใดอย่างหนึ่งก็พอ — ถ้ามีดอกเบี้ย ระบบจะคำนวณเงินต้นและดอกเบี้ยรวมให้
        </div>
      )}

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

// ════════════════════════════════════════════════════════════════════════════
//  Mini stat (used inside DebtRow for interest breakdown)
// ════════════════════════════════════════════════════════════════════════════
function MiniStat({ label, value, color, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Debt Strategy — Snowball vs Avalanche payoff simulator
// ════════════════════════════════════════════════════════════════════════════
function DebtStrategyCard({ debts }) {
  const [strategy, setStrategy] = useState('snowball'); // 'snowball' | 'avalanche'
  const [extra, setExtra]       = useState(0);

  const result = useMemo(
    () => simulatePayoff(debts, strategy, Number(extra) || 0),
    [debts, strategy, extra]
  );

  if (!result.debts.length) {
    return (
      <div style={{
        marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)',
        fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', textAlign: 'center',
      }}>
        ต้องการ "งวดทั้งหมด" ในหนี้อย่างน้อย 1 รายการ เพื่อจำลองการโปะหนี้
      </div>
    );
  }

  const desc = {
    snowball:  'โปะหนี้ก้อนเล็กก่อน → ปิดได้เร็ว สร้างกำลังใจ',
    avalanche: 'โปะหนี้ดอกเบี้ยสูงก่อน → ประหยัดดอกเบี้ยมากที่สุด',
  }[strategy];

  // Turn "months left" into a tangible calendar date.
  const freedomLabel = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + (result.totalMonthsWithExtra || 0));
    return d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  })();

  return (
    <div style={{
      marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.16em' }}>
            ⚡ STRATEGY · โปะหนี้
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            {desc}
          </div>
        </div>
        {/* Strategy toggle */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--background-soft)', padding: 3, borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)' }}>
          {[
            { id: 'snowball',  label: '⛄ Snowball'  },
            { id: 'avalanche', label: '⛰ Avalanche' },
          ].map(s => (
            <button key={s.id} onClick={() => setStrategy(s.id)} className="focus-ring"
              style={{
                padding: '5px 12px', borderRadius: 'var(--radius-pill)', border: 0,
                background: strategy === s.id ? 'var(--surface)' : 'transparent',
                color: strategy === s.id ? 'var(--accent-strong)' : 'var(--text-muted)',
                fontSize: 11, fontFamily: 'var(--f-mono)', cursor: 'pointer',
                boxShadow: strategy === s.id ? '0 1px 3px rgba(80,60,30,.12)' : 'none',
                fontWeight: strategy === s.id ? 600 : 400,
              }}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Extra payment slider */}
      <div style={{
        padding: '12px 14px', background: 'var(--background-soft)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            💵 โปะเพิ่มต่อเดือน
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>฿</span>
            <input type="number" min="0" step="500" value={extra}
              onChange={e => setExtra(e.target.value)}
              style={{
                width: 110, background: 'var(--surface)', border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-control)', padding: '6px 10px', textAlign: 'right',
                fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--text-primary)',
              }} />
          </div>
        </div>
        <input type="range" min="0" max="50000" step="500" value={extra}
          onChange={e => setExtra(e.target.value)}
          style={{ accentColor: 'var(--accent)', width: '100%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)' }}>
          <span>฿0</span><span>฿25K</span><span>฿50K</span>
        </div>
      </div>

      {/* Debt-free date hero */}
      <div style={{
        padding: '16px 18px', borderRadius: 'var(--radius-control)',
        background: 'var(--accent-soft)', border: '1px solid var(--accent)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <span style={{ fontSize: 30, lineHeight: 1 }}>🎯</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent-strong)' }}>
            วันปลอดหนี้
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 600, color: 'var(--accent-strong)', lineHeight: 1.15 }}>
            {freedomLabel}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            อีก {result.totalMonthsWithExtra} เดือน
            {result.monthsSaved > 0 && ` · โปะเพิ่มช่วยร่นเร็วขึ้น ${result.monthsSaved} เดือน ประหยัด ${fmt(result.cashSaved)}`}
          </div>
        </div>
      </div>

      {/* Result comparison */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10,
        padding: 12, background: result.cashSaved > 0 ? 'var(--success-soft)' : 'var(--surface-muted)',
        border: '1px solid ' + (result.cashSaved > 0 ? 'var(--success)' : 'var(--border)'),
        borderRadius: 'var(--radius-control)',
      }}>
        <MiniStat label="ปลอดหนี้ใน" value={`${result.totalMonthsWithExtra} เดือน`} color="var(--text-primary)"
          sub={`ปกติ ${result.totalMonthsBaseline} เดือน`} />
        <MiniStat label="เร็วขึ้น" value={`${result.monthsSaved} เดือน`}
          color={result.monthsSaved > 0 ? 'var(--success)' : 'var(--text-muted)'}
          sub={result.monthsSaved >= 12 ? `~${(result.monthsSaved / 12).toFixed(1)} ปี` : ''} />
        <MiniStat label="ประหยัด" value={fmt(result.cashSaved)}
          color={result.cashSaved > 0 ? 'var(--success)' : 'var(--text-muted)'}
          sub="เทียบกับไม่โปะ" />
      </div>

      {/* Payoff order */}
      <div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.14em', marginBottom: 8 }}>
          ลำดับการปลอดหนี้
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {result.debts.map((d) => (
            <div key={d.id} style={{
              display: 'grid', gridTemplateColumns: '28px 1fr auto auto', gap: 10,
              padding: '8px 12px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
              alignItems: 'center', fontSize: 12,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: d.payoffOrder === 1 ? 'var(--accent)' : 'var(--surface-muted)',
                color: d.payoffOrder === 1 ? 'var(--text-inverse)' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontFamily: 'var(--f-mono)', fontWeight: 600,
              }}>{d.payoffOrder}</div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                {d.name}
                <span style={{ marginLeft: 6, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                  {d.interest_rate > 0 ? `· ${d.interest_rate.toFixed(1)}%/ปี` : ''}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                {d.simMonths} เดือน
              </div>
              {d.monthsSaved > 0 && (
                <Badge tone="success" size="sm">-{d.monthsSaved}เดือน</Badge>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

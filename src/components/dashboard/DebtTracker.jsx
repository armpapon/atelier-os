import { useState, useMemo } from 'react';
import { Badge, Button, EmptyState } from '../ui/index.js';
import { SectionCaption, InsetGroup, RowBar, Pill, NUM } from './InsetList.jsx';
import {
  summarizeDebts, forecastDebts, recordDebtPayment, deleteDebtPayment, deleteDebt,
  calculateDebtMath, simulatePayoff, archiveDebt,
} from '../../lib/api/finance.js';
import { Icon } from '../Icon.jsx';

const TYPE_META = {
  loan:         { icon: '🏦', label: 'สินเชื่อ' },
  credit_card:  { icon: '💳', label: 'บัตรเครดิต' },
  mortgage:     { icon: '🏠', label: 'บ้าน' },
  lease:        { icon: '🚗', label: 'เช่าซื้อ' },
  installment:  { icon: '📅', label: 'ผ่อน' },
  other:        { icon: '◇',  label: 'อื่น ๆ' },
};

const STATUS_META = {
  paid:      { label: 'จ่ายแล้ว',    tone: 'success', icon: 'check' },
  pending:   { label: 'รอจ่าย',      tone: 'warning', icon: 'clock' },
  overdue:   { label: 'เกินกำหนด',   tone: 'danger',  icon: 'warning' },
  upcoming:  { label: 'ยังไม่เริ่ม',  tone: 'neutral', icon: 'hourglass' },
  // Batch C · B8: a loan that is finished says so, instead of going overdue
  // again every month for the rest of time.
  completed: { label: 'ผ่อนหมดแล้ว', tone: 'success', icon: 'flag' },
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

  // Ids currently being written. months_paid is a read-modify-write, so two
  // fast clicks used to increment it twice for the same month.
  const [busyDebts, setBusyDebts] = useState(() => new Set());
  const setBusy = (id, on) => setBusyDebts(prev => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  // Mark paid handler
  const markPaid = async (debt) => {
    if (busyDebts.has(debt.id)) return;
    const monthDate = yearMonth + '-01';
    setBusy(debt.id, true);
    try {
      await recordDebtPayment({
        debt_id: debt.id, pay_month: monthDate,
        amount_paid: Number(debt.monthly_payment),
      });
      onChange?.();
    } catch (e) { alert('บันทึกไม่สำเร็จ: ' + e.message); }
    finally { setBusy(debt.id, false); }
  };

  const unmarkPaid = async (debtId, paymentId) => {
    if (busyDebts.has(debtId)) return;
    if (!confirm('ยกเลิกบันทึกการจ่ายนี้?')) return;
    setBusy(debtId, true);
    try { await deleteDebtPayment(paymentId); onChange?.(); }
    catch (e) { alert('ยกเลิกไม่สำเร็จ: ' + e.message); }
    finally { setBusy(debtId, false); }
  };

  // B8: a finished loan can be filed away — the payment history survives,
  // the row just stops showing up (listDebts filters on is_active).
  const handleArchive = async (debt) => {
    if (!confirm(`เก็บ "${debt.name}" เข้าคลัง?\n(ผ่อนหมดแล้ว — ประวัติการจ่ายยังอยู่ครบ แค่ไม่แสดงในรายการ)`)) return;
    try { await archiveDebt(debt.id); onChange?.(); }
    catch (e) { alert('เก็บไม่สำเร็จ: ' + e.message); }
  };

  const handleDelete = async (debt) => {
    if (!confirm(`ลบหนี้สิน "${debt.name}"?\n(บันทึกการจ่ายทั้งหมดของหนี้นี้จะถูกลบด้วย)`)) return;
    try { await deleteDebt(debt.id); onChange?.(); }
    catch (e) { alert('ลบไม่สำเร็จ: ' + e.message); }
  };

  return (
    <div>
      <SectionCaption
        action={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {debts.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => setShowStrategy(s => !s)}>
                {showStrategy ? '× Strategy' : 'โปะหนี้'}
              </Button>
            )}
            {debts.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowForecast(s => !s)}>
                {showForecast ? '× Forecast' : 'Forecast'}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)}>+ เพิ่ม</Button>
          </div>
        }>
        หนี้ทั้งหมด · {debts.length} ก้อน
      </SectionCaption>

      {debts.length > 0 && (
        <>
          <div style={{ margin: '-4px 6px 8px', fontSize: 12.5, color: 'var(--text-muted)', ...NUM }}>
            ภาระต่อเดือน {fmt(summary.monthlyBurden)}
            {summary.completedCount > 0 && ` · ผ่อนหมดแล้ว ${summary.completedCount} รายการ`}
            {summary.upcomingCount  > 0 && ` · ยังไม่เริ่ม ${summary.upcomingCount} รายการ`}
          </div>
          {/* This month's payment status. The totals (คงเหลือรวม · ผ่อนรวม) are
              the room's hero now, so they are not repeated here. */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
            padding: '12px 16px', marginBottom: 10,
            background: 'var(--surface)', borderRadius: 16, boxShadow: 'var(--shadow-card)',
          }}>
            <StatTile label="จ่ายแล้ว"  value={summary.paidCount}    color="var(--success)" sub={fmt(summary.paidThisMonth)} />
            <StatTile label="รอจ่าย"    value={summary.pendingCount} color="var(--warning)" sub={fmt(summary.pending)} />
            <StatTile label="เกินกำหนด" value={summary.overdueCount} color="var(--danger)"  sub={fmt(summary.overdue)} />
          </div>
        </>
      )}

      {/* Add form (shows above the list — only for new debts) */}
      {showAdd && (
        <DebtForm scope={scope} onSubmit={async () => { setShowAdd(false); onChange?.(); }} onCancel={() => setShowAdd(false)} />
      )}

      {/* Empty state */}
      {debts.length === 0 && !showAdd ? (
        <InsetGroup>
          <div style={{ padding: '6px 16px 10px' }}>
            <EmptyState
              icon={<Icon name="card" size={20} />}
              title="ยังไม่มีรายการหนี้สิน"
              description="เพิ่มหนี้สินที่ผ่อนรายเดือน (บัตรเครดิต ผ่อนรถ บ้าน) เพื่อ track ว่าจ่ายหรือยัง และ forecast วันปลอดหนี้"
              actionLabel="เพิ่มหนี้สินแรก"
              onAction={() => setShowAdd(true)}
              compact
            />
          </div>
        </InsetGroup>
      ) : (
        /* Debt list — one grouped-inset list; the edit form opens inside the row */
        <InsetGroup>
          {summary.statuses.map(({ debt, status }, i) => (
            <div key={debt.id}>
              <DebtRow
                debt={debt}
                status={status}
                first={i === 0}
                isEditing={editing?.id === debt.id}
                busy={busyDebts.has(debt.id)}
                onMarkPaid={() => markPaid(debt)}
                onUnmark={() => unmarkPaid(debt.id, status.payment_id)}
                onEdit={() => setEditing(editing?.id === debt.id ? null : debt)}
                onArchive={() => handleArchive(debt)}
                onDelete={() => handleDelete(debt)}
              />
              {editing?.id === debt.id && (
                <div style={{ padding: '0 16px 14px' }}>
                  <DebtForm
                    initial={editing}
                    scope={scope}
                    onSubmit={async () => { setEditing(null); onChange?.(); }}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </InsetGroup>
      )}

      {/* Forecast — 12 months */}
      {showForecast && debts.length > 0 && (
        <div style={{ marginTop: 12, padding: '14px 16px', background: 'var(--surface)', borderRadius: 16, boxShadow: 'var(--shadow-card)' }}>
          <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
            <Icon name="chart" size={14} /> คาดการณ์ · 12 เดือนข้างหน้า
          </div>
          <ForecastChart data={forecast} />
        </div>
      )}

      {/* Strategy comparison */}
      {showStrategy && debts.length > 1 && (
        <div style={{ marginTop: 12, padding: '4px 16px 16px', background: 'var(--surface)', borderRadius: 16, boxShadow: 'var(--shadow-card)' }}>
          <DebtStrategyCard debts={debts} />
        </div>
      )}
    </div>
  );
}

/** A value is MISSING when it is null, blank or unreadable — a real 0 is data. */
function isMissing(v) {
  if (v == null) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return !Number.isFinite(Number(v));
}

// ════════════════════════════════════════════════════════════════════════════
//  Debt Row — one line of the grouped-inset list (v4.59).
//  Left: name + terms + progress. Right: balance over rate. Below: the actions,
//  unchanged — every CRUD path this row had still fires the same handler.
// ════════════════════════════════════════════════════════════════════════════
function DebtRow({ debt, status, isEditing, busy = false, first = false, onMarkPaid, onUnmark, onEdit, onArchive, onDelete }) {
  const typeMeta   = TYPE_META[debt.type]      || TYPE_META.other;
  const statusMeta = STATUS_META[status.status] || STATUS_META.upcoming;
  const monthsRemaining = debt.total_months
    ? Math.max(0, Number(debt.total_months) - Number(debt.months_paid || 0))
    : null;
  const progressPct = debt.total_months
    ? Math.min(100, (Number(debt.months_paid || 0) / Number(debt.total_months)) * 100)
    : 0;
  const math = calculateDebtMath(debt);

  const rateMissing    = isMissing(debt.interest_rate);
  const balanceMissing = isMissing(debt.remaining_balance);
  const incomplete     = rateMissing || balanceMissing;

  return (
    <div style={{
      padding: '13px 16px',
      borderTop: first ? 'none' : '1px solid var(--hairline)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 16, fontWeight: 500, letterSpacing: '-0.01em',
            color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{debt.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 1, ...NUM }}>
            งวดละ {fmt(debt.monthly_payment)} · ครบกำหนดทุกวันที่ {debt.due_day || 5}
            {debt.creditor && ` · ${debt.creditor}`}
          </div>

          {/* An incomplete row is an INVITATION, not a fault: blue, never red. */}
          {incomplete && (
            <div style={{ marginTop: 6 }}>
              <Pill tone="info">
                {rateMissing && balanceMissing ? 'ขาดยอด/อัตรา — กรอกเพิ่มเพื่อเข้าแผนโปะ'
                  : rateMissing ? 'ขาดอัตราดอกเบี้ย — กรอกเพิ่ม'
                  : 'ขาดยอดคงเหลือ — กรอกเพิ่ม'}
              </Pill>
            </div>
          )}

          {/* Progress — grey when the row's own data can't be trusted yet */}
          {debt.total_months ? (
            <>
              <RowBar pct={progressPct}
                color={incomplete ? 'var(--ink-4)'
                  : progressPct >= 100 ? 'var(--success)' : 'var(--accent)'} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, ...NUM }}>
                {debt.months_paid || 0} / {debt.total_months} งวด · {progressPct.toFixed(0)}%
                {monthsRemaining > 0 && ` · เหลือ ${monthsRemaining} เดือน`}
                {monthsRemaining === 0 && ' · ปลอดหนี้!'}
              </div>
            </>
          ) : null}

          {/* The interest split, one line instead of three tiles */}
          {math.hasInterestData && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, ...NUM }}>
              เงินต้น {fmt(math.principal)} · ดอกรวม {fmt(math.totalInterest)} · ดอกที่เหลือ {fmt(math.remainingInterest)}
            </div>
          )}
        </div>

        <div style={{ flex: 'none', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', ...NUM }}>
            {balanceMissing ? '—' : fmt(debt.remaining_balance)}
          </div>
          <div style={{
            fontSize: 12, fontWeight: 500, ...NUM,
            color: rateMissing ? 'var(--text-muted)'
              : Number(debt.interest_rate) >= 12 ? 'var(--danger)' : 'var(--text-muted)',
          }}>
            {rateMissing ? '?%' : `${Number(debt.interest_rate).toFixed(2)}%`}
          </div>
          <Badge tone={statusMeta.tone} size="sm">
            <span style={{ marginRight: 4 }}><Icon name={statusMeta.icon} size={12} /></span>{statusMeta.label}
          </Badge>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{typeMeta.label}</div>
        </div>
      </div>

      {/* Actions — unchanged behaviour, quieter chrome */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {status.status === 'completed' ? (
          /* B8: nothing left to pay — offer to file it away instead of
             nagging for a payment that does not exist. */
          <Button variant="secondary" size="sm" onClick={onArchive}>
            <Icon name="archive" size={14} /> ผ่อนหมดแล้ว — เก็บเข้าคลัง
          </Button>
        ) : status.status === 'upcoming' ? (
          <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>
            เริ่มผ่อน {status.startDate ? new Date(status.startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : 'เดือนหน้า'}
          </span>
        ) : status.status === 'paid' ? (
          <Button variant="ghost" size="sm" onClick={onUnmark} disabled={busy}>
            <Icon name="check" size={12} /> จ่ายแล้วเมื่อ {new Date(status.paid_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} · ยกเลิก
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={onMarkPaid} disabled={busy}>
            {busy ? 'กำลังบันทึก…' : <><Icon name="check" size={13} /> บันทึกว่าจ่ายแล้ว</>}
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
    end_date:           initial?.end_date           || '',
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
        end_date:           form.end_date   || null,
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
      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>
        {initial ? 'แก้ไขหนี้สิน' : 'เพิ่มหนี้สินใหม่'}
      </div>

      <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
        placeholder="ชื่อ เช่น 'BMW Leasing' หรือ 'KTC บัตรเครดิต'" required style={inputStyle} />

      <input type="text" value={form.creditor} onChange={e => set('creditor', e.target.value)}
        placeholder="ผู้รับชำระ (ถ้ามีในรายการธุรกรรม จะ match อัตโนมัติ)" style={inputStyle} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 6 }}>
        <div>
          <label style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>ค่างวด/เดือน (฿)</label>
          <input type="number" min="0" step="0.01" value={form.monthly_payment}
            onChange={e => set('monthly_payment', e.target.value)} placeholder="19253" required
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)' }} />
        </div>
        <div>
          <label style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>ครบกำหนด</label>
          <input type="number" min="1" max="31" value={form.due_day}
            onChange={e => set('due_day', e.target.value)} required
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)' }} />
        </div>
        <div>
          <label style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>งวดทั้งหมด</label>
          <input type="number" min="0" value={form.total_months}
            onChange={e => set('total_months', e.target.value)} placeholder="60"
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <div>
          <label style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>จ่ายไปแล้วกี่งวด</label>
          <input type="number" min="0" value={form.months_paid}
            onChange={e => set('months_paid', e.target.value)}
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)' }} />
        </div>
        <div>
          <label style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>เริ่มผ่อน</label>
          <input type="date" value={form.start_date}
            onChange={e => set('start_date', e.target.value)}
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)', color: 'var(--text-secondary)' }} />
        </div>
        <div>
          {/* B8: the end of the loan is what tells the tracker to stop. */}
          <label style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>ผ่อนหมด</label>
          <input type="date" value={form.end_date}
            onChange={e => set('end_date', e.target.value)}
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)', color: 'var(--text-secondary)' }} />
        </div>
      </div>

      {/* Interest rate + original principal — optional for interest math */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div>
          <label style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
            ดอกเบี้ยต่อปี (%) <span style={{ color: 'var(--text-muted)' }}>· optional</span>
          </label>
          <input type="number" min="0" step="0.01" value={form.interest_rate}
            onChange={e => set('interest_rate', e.target.value)} placeholder="5.5"
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)' }} />
        </div>
        <div>
          <label style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
            เงินต้น (฿) <span style={{ color: 'var(--text-muted)' }}>· optional</span>
          </label>
          <input type="number" min="0" step="0.01" value={form.original_principal}
            onChange={e => set('original_principal', e.target.value)} placeholder="1000000"
            style={{ ...inputStyle, width: '100%', fontFamily: 'var(--f-mono)' }} />
        </div>
      </div>
      {(form.interest_rate || form.original_principal) && (
        <div style={{ fontVariantNumeric: 'tabular-nums',
          padding: '8px 12px', background: 'var(--accent-soft)',
          borderRadius: 'var(--radius-control)', fontSize: 11, color: 'var(--accent-strong)'
        }}>
          <Icon name="bulb" size={13} /> ใส่อย่างใดอย่างหนึ่งก็พอ — ถ้ามีดอกเบี้ย ระบบจะคำนวณเงินต้นและดอกเบี้ยรวมให้
        </div>
      )}

      {/* Type chips */}
      <div>
        <label style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>ประเภท</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {Object.entries(TYPE_META).map(([k, m]) => (
            <button key={k} type="button" onClick={() => set('type', k)} className="focus-ring"
              style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums',
                padding: '4px 10px', borderRadius: 'var(--radius-pill)', fontSize: 13, cursor: 'pointer',
                background: form.type === k ? 'var(--accent-soft)' : 'var(--surface)',
                color: form.type === k ? 'var(--accent-strong)' : 'var(--text-secondary)',
                border: `1px solid ${form.type === k ? 'var(--accent)' : 'var(--border)'}`
              }}>{m.icon} {m.label}</button>
          ))}
        </div>
      </div>

      <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)}
        placeholder="หมายเหตุ (ถ้ามี)" style={inputStyle} />

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" variant="primary" size="sm" disabled={saving}>
          {saving ? '...' : (initial ? 'บันทึก' : '+ เพิ่มหนี้สิน')}
        </Button>
      </div>
    </form>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Stat Tile — this month's payment status, three across
// ════════════════════════════════════════════════════════════════════════════
function StatTile({ label, value, color, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color, lineHeight: 1.1, ...NUM }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', ...NUM }}>{sub}</div>
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
        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
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
              <div style={{ fontVariantNumeric: 'tabular-nums',
                fontSize: 13, color: 'var(--text-muted)',
                fontWeight: i === 0 ? 600 : 400
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
      <div style={{ fontWeight: 500, fontSize: 9, color: 'var(--text-muted)'}}>
        {label}
      </div>
      <div style={{ fontSize: 12, color, fontWeight: 600, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums',
        marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hairline)',
        fontSize: 13, color: 'var(--text-muted)', textAlign: 'center'
      }}>
        ต้องการ "งวดทั้งหมด" ในหนี้อย่างน้อย 1 รายการ เพื่อจำลองการโปะหนี้
      </div>
    );
  }

  // The simulation runs on instalment counts only (no interest accrual), so
  // copy must never promise baht saved — only months, labelled as such.
  const desc = {
    snowball:  'โปะหนี้ก้อนเล็กก่อน → ปิดได้เร็ว สร้างกำลังใจ',
    avalanche: 'โปะหนี้ดอกเบี้ยสูงก่อน → ลดภาระดอกเบี้ยในชีวิตจริง (ตัวเลขจำลองด้านล่างยังไม่คิดดอกเบี้ย)',
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
      marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hairline)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>
            <Icon name="bolt" size={14} /> กลยุทธ์ · โปะหนี้
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            {desc}
          </div>
        </div>
        {/* Strategy toggle */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--background-soft)', padding: 3, borderRadius: 'var(--radius-pill)', border: '1px solid var(--hairline)' }}>
          {[
            { id: 'snowball',  label: 'Snowball'  },
            { id: 'avalanche', label: 'Avalanche' },
          ].map(s => (
            <button key={s.id} onClick={() => setStrategy(s.id)} className="focus-ring"
              style={{ fontVariantNumeric: 'tabular-nums',
                padding: '5px 12px', borderRadius: 'var(--radius-pill)', border: 0,
                background: strategy === s.id ? 'var(--surface)' : 'transparent',
                color: strategy === s.id ? 'var(--accent-strong)' : 'var(--text-muted)',
                fontSize: 13, cursor: 'pointer',
                boxShadow: strategy === s.id ? 'var(--shadow-card)' : 'none',
                fontWeight: strategy === s.id ? 600 : 400
              }}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Extra payment slider */}
      <div style={{
        padding: '12px 14px', background: 'var(--background-soft)',
        border: '1px solid var(--hairline)', borderRadius: 'var(--radius-control)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <Icon name="money" size={14} /> โปะเพิ่มต่อเดือน
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
        <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)' }}>
          <span>฿0</span><span>฿25K</span><span>฿50K</span>
        </div>
      </div>

      {/* Debt-free date hero */}
      <div style={{
        padding: '16px 18px', borderRadius: 'var(--radius-control)',
        background: 'var(--accent-soft)', border: '1px solid var(--accent)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <span style={{ color: 'var(--accent-strong)', lineHeight: 1 }}><Icon name="target" size={28} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--accent-strong)' }}>
            วันปลอดหนี้
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 600, color: 'var(--accent-strong)', lineHeight: 1.15 }}>
            {freedomLabel}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            อีก {result.totalMonthsWithExtra} เดือน
            {result.monthsSaved > 0 && ` · โปะเพิ่มช่วยร่นเร็วขึ้น ${result.monthsSaved} เดือน (แบบไม่คิดดอกเบี้ย)`}
          </div>
        </div>
      </div>

      {/* Result comparison */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10,
        padding: 12, background: 'var(--surface-muted)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-control)',
      }}>
        <MiniStat label="ปลอดหนี้ใน" value={`${result.totalMonthsWithExtra} เดือน`} color="var(--text-primary)"
          sub={`ปกติ ${result.totalMonthsBaseline} เดือน`} />
        <MiniStat label="เร็วขึ้น" value={`${result.monthsSaved} เดือน`}
          color={result.monthsSaved > 0 ? 'var(--success)' : 'var(--text-muted)'}
          sub="แบบไม่คิดดอกเบี้ย" />
        <MiniStat label="ดอกเบี้ยที่ประหยัด" value="—"
          color="var(--text-muted)"
          sub="โมเดลนี้ยังไม่คิดดอกเบี้ย" />
      </div>

      {/* Payoff order */}
      <div>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
          ลำดับการปลอดหนี้
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {result.debts.map((d) => (
            <div key={d.id} style={{
              display: 'grid', gridTemplateColumns: '28px 1fr auto auto', gap: 10,
              padding: '8px 12px', background: 'var(--fill)',
              borderRadius: 'var(--radius-control)',
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
                <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', marginLeft: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                  {d.interest_rate > 0 ? `· ${d.interest_rate.toFixed(1)}%/ปี` : ''}
                </span>
              </div>
              <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-secondary)' }}>
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

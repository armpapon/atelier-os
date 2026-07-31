import { useState, useMemo } from 'react';
import { Card, CardHeader, Badge, Button, EmptyState } from '../ui/index.js';
import {
  createRecurring, updateRecurring, deleteRecurring,
  detectRecurringFromTransactions, checkRecurringStatus,
  forecastCashFlow, computeEmergencyFundCoverage,
  updateAccount, createTransaction,
} from '../../lib/api/finance.js';

const fmt = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 1_000_000) return '฿' + (a / 1_000_000).toFixed(2) + 'M';
  if (a >= 1000)      return '฿' + (a / 1000).toFixed(1) + 'K';
  return '฿' + a.toLocaleString('th', { maximumFractionDigits: 0 });
};

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// ════════════════════════════════════════════════════════════════════════════
//  1. RecurringTracker
// ════════════════════════════════════════════════════════════════════════════
const RECURRING_STATUS = {
  paid:     { label: 'จ่ายแล้ว', tone: 'success', icon: '✓' },
  pending:  { label: 'รอจ่าย',   tone: 'warning', icon: '◷' },
  overdue:  { label: 'เกินกำหนด', tone: 'danger',  icon: '!' },
  upcoming: { label: 'อนาคต',    tone: 'neutral', icon: '…' },
};

export function RecurringTracker({ recurring, transactions, yearMonth, scope, onChange }) {
  const [adding, setAdding]     = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);

  const suggestions = useMemo(() => {
    if (!transactions?.length) return [];
    const existingTitles = new Set(recurring.map(r => (r.vendor || r.name || '').toLowerCase()));
    return detectRecurringFromTransactions(transactions)
      .filter(s => !existingTitles.has((s.title || '').toLowerCase()))
      .slice(0, 8);
  }, [transactions, recurring]);

  const statusFor = (r) => RECURRING_STATUS[checkRecurringStatus(r, transactions, yearMonth).status] || RECURRING_STATUS.upcoming;

  // Mark a bill paid by logging the matching expense for the viewed month —
  // checkRecurringStatus then auto-detects it and flips the status to "paid".
  const markPaid = async (r) => {
    let amt = Number(r.amount || 0);
    if (amt > 0) {
      if (!confirm(`บันทึกว่าจ่าย "${r.name}" ${fmt(amt)} แล้ว?`)) return;
    } else {
      const input = prompt(`จ่าย "${r.name}" เดือนนี้เท่าไหร่? (บาท)`);
      if (input == null) return;
      amt = Number(input);
      if (!amt || amt <= 0) { alert('กรุณาใส่จำนวนเงิน'); return; }
    }
    const dd = String(Math.min(Number(r.due_day) || 5, 28)).padStart(2, '0');
    try {
      await createTransaction({
        title: r.name,
        amount: -Math.abs(amt),
        // 'expense' is not one of the app's types — the row then fell outside
        // every type-based breakdown. Recurring bills are 'bills'.
        type: 'bills',
        category: r.category || 'ค่าใช้จ่ายประจำ',
        note: 'บิลประจำ',
        occurred_at: `${yearMonth}-${dd}T12:00:00+07:00`,
        scope: r.scope || scope,
        recurring_id: r.id,
      });
      onChange?.();
    } catch (err) { alert(err.message); }
  };
  const total     = recurring.reduce((s, r) => s + Number(r.amount || 0), 0);
  const paidCount = recurring.filter(r => checkRecurringStatus(r, transactions, yearMonth).status === 'paid').length;
  const overdueCount = recurring.filter(r => checkRecurringStatus(r, transactions, yearMonth).status === 'overdue').length;

  return (
    <Card>
      <CardHeader
        eyebrow={`📅 RECURRING · ${recurring.length} รายการ · ภาระต่อเดือน ${fmt(total)}`}
        title="บิล / ค่าใช้จ่ายประจำ"
        meta={`${paidCount} จ่ายแล้ว · ${overdueCount} เกินกำหนด`}
        action={
          <div style={{ display: 'flex', gap: 6 }}>
            {suggestions.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowSuggest(s => !s)}>
                {showSuggest ? '× Suggest' : `🔍 พบ ${suggestions.length}`}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>+ เพิ่ม</Button>
          </div>
        }
      />

      {adding && <RecurringForm scope={scope} onCancel={() => setAdding(false)}
        onSubmit={async () => { setAdding(false); onChange?.(); }} />}

      {showSuggest && suggestions.length > 0 && (
        <SuggestionsList suggestions={suggestions} scope={scope}
          onAdd={async (sug) => {
            await createRecurring({
              name: sug.title, vendor: sug.title, amount: sug.avgAmount,
              frequency: 'monthly', due_day: 5,
              scope: sug.scope, is_active: true,
            });
            onChange?.();
          }} />
      )}

      {recurring.length === 0 && !adding ? (
        <EmptyState
          icon="📅"
          title="ยังไม่มีบิลประจำ"
          description={suggestions.length
            ? `ระบบเจอ ${suggestions.length} รายการที่น่าจะเป็นบิลประจำ — คลิก 🔍 เพื่อดู`
            : 'เพิ่มบิลประจำ (Netflix, AIS, ค่าไฟ ฯลฯ) เพื่อ track ว่าจ่ายหรือยัง'}
          actionLabel={suggestions.length ? `🔍 ดู ${suggestions.length} suggestions` : '+ เพิ่มบิลแรก'}
          onAction={() => suggestions.length ? setShowSuggest(true) : setAdding(true)}
          compact
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recurring.map(r => {
            const rawStatus = checkRecurringStatus(r, transactions, yearMonth).status;
            const st = RECURRING_STATUS[rawStatus] || RECURRING_STATUS.upcoming;
            const isPaid = rawStatus === 'paid';
            return (
              <div key={r.id} style={{
                padding: '10px 12px',
                background: st.tone === 'danger' ? 'var(--danger-soft)' : 'var(--fill)',
                borderRadius: 'var(--radius-control)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name}
                  </div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    {r.frequency === 'monthly' ? `ทุก ${r.due_day || 5} ของเดือน` : r.frequency}
                    {r.category ? ` · ${r.category}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {Number(r.amount) > 0 ? fmt(r.amount) : 'ผันแปร'}
                  </div>
                  <Badge tone={st.tone} size="sm">{st.icon} {st.label}</Badge>
                </div>
                {!isPaid && (
                  <button onClick={() => markPaid(r)} title="บันทึกว่าจ่ายแล้ว"
                    style={{ flexShrink: 0, background: 'var(--success-soft)', color: 'var(--success)', border: '1px solid var(--success)',
                      borderRadius: 'var(--radius-pill)', fontFamily: 'var(--f-body)', fontSize: 11.5, fontWeight: 500, padding: '5px 11px', cursor: 'pointer' }}>
                    ✓ จ่ายแล้ว
                  </button>
                )}
                <button onClick={() => { if (confirm(`ลบ "${r.name}"?`)) deleteRecurring(r.id).then(onChange); }}
                  aria-label="ลบ"
                  style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 15, cursor: 'pointer', padding: 4 }}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function SuggestionsList({ suggestions, scope, onAdd }) {
  return (
    <div style={{
      background: 'var(--accent-soft)', border: '1px solid var(--accent)',
      borderRadius: 'var(--radius-control)', padding: 12, marginBottom: 10,
    }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--accent-strong)', letterSpacing: '0.14em', marginBottom: 8 }}>
        🔍 ตรวจพบ — รายการที่เกิดซ้ำใน ≥ 2 เดือน
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {suggestions.map((s, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10,
            padding: '8px 12px', alignItems: 'center', fontSize: 12,
            background: 'var(--fill)',
            borderRadius: 'var(--radius-control)',
          }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
              {s.title}
              <span style={{ marginLeft: 6, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                · {s.monthsCount} เดือน
              </span>
            </div>
            <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--text-secondary)' }}>{fmt(s.avgAmount)}</span>
            <Badge tone={s.scope === 'family' ? 'accent' : 'neutral'} size="sm">
              {s.scope === 'family' ? 'ครอบครัว' : 'ส่วนตัว'}
            </Badge>
            <Button variant="primary" size="sm" onClick={() => onAdd(s)}>+ เพิ่ม</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecurringForm({ initial, scope, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '', amount: initial?.amount || '',
    frequency: initial?.frequency || 'monthly',
    due_day: initial?.due_day || 5,
    category: initial?.category || '',
    scope: initial?.scope || scope || 'personal',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      const payload = {
        ...form, amount: form.amount === '' ? 0 : Number(form.amount), due_day: Number(form.due_day) || 5,
        vendor: form.name.trim(), is_active: true,
      };
      if (initial) await updateRecurring(initial.id, payload);
      else         await createRecurring(payload);
      onSubmit();
    } catch (e) { alert(e.message); }
  };
  const input = { background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-control)', padding: '7px 10px', color: 'var(--text-primary)', fontSize: 12.5 };
  return (
    <form onSubmit={submit} style={{
      background: 'var(--background-soft)', border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-control)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10,
    }}>
      <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
        placeholder='ชื่อ เช่น "Netflix" "การไฟฟ้านครหลวง" "AIS"' required style={input} />
      <div style={{ display: 'grid', gridTemplateColumns: '120px 110px 90px 1fr', gap: 6 }}>
        <input type="number" min="0" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)}
          placeholder="ค่างวด (ว่างได้)" style={{ ...input, fontFamily: 'var(--f-mono)' }} />
        <select value={form.frequency} onChange={e => set('frequency', e.target.value)} style={input}>
          <option value="monthly">รายเดือน</option>
          <option value="weekly">รายสัปดาห์</option>
          <option value="quarterly">รายไตรมาส</option>
          <option value="yearly">รายปี</option>
        </select>
        <input type="number" min="1" max="31" value={form.due_day} onChange={e => set('due_day', e.target.value)}
          placeholder="วันที่" style={{ ...input, fontFamily: 'var(--f-mono)' }} />
        <input type="text" value={form.category} onChange={e => set('category', e.target.value)}
          placeholder="หมวด (streaming, utility...)" style={input} />
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {['personal', 'family'].map(s => (
          <button key={s} type="button" onClick={() => set('scope', s)} className="focus-ring"
            style={{
              padding: '4px 14px', borderRadius: 'var(--radius-pill)', fontSize: 11, cursor: 'pointer',
              background: form.scope === s ? 'var(--accent-soft)' : 'var(--surface)',
              color: form.scope === s ? 'var(--accent-strong)' : 'var(--text-secondary)',
              border: '1px solid ' + (form.scope === s ? 'var(--accent)' : 'var(--border)'),
              fontFamily: 'var(--f-mono)',
            }}>{s === 'family' ? 'ครอบครัว' : 'ส่วนตัว'}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" variant="primary" size="sm">บันทึก</Button>
      </div>
    </form>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  2. Cash Flow Forecast (3 months)
// ════════════════════════════════════════════════════════════════════════════
export function CashFlowForecastCard({ forecast }) {
  if (!forecast || forecast.monthlyIncome === 0) {
    return (
      <Card>
        <CardHeader eyebrow="🔮 FORECAST · 3 เดือน" title="คาดการณ์เงินสด" />
        <EmptyState
          icon="🔮"
          title="ต้องการข้อมูลเพิ่ม"
          description="ระบบจะคำนวณ forecast เมื่อมีรายรับ + recurring expenses + debts ในระบบ"
          compact
        />
      </Card>
    );
  }

  const { projection, monthlyIncome, fixedExpense, debtPaymentNow, avgVariableExpense, monthlyNetNow } = forecast;
  const finalCum = projection[projection.length - 1]?.cumulative || 0;
  const willOverflow = projection.some(p => p.net < 0);

  return (
    <Card>
      <CardHeader
        eyebrow="🔮 CASH FLOW · 3 เดือนข้างหน้า"
        title="คาดการณ์เงินสด"
        meta={`รายเดือน: ${fmt(monthlyIncome)} − ${fmt(fixedExpense + debtPaymentNow + avgVariableExpense)} = ${monthlyNetNow >= 0 ? '+' : '-'}${fmt(Math.abs(monthlyNetNow))}`}
      />

      {/* Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        <Stat label="รายรับ"    value={'+' + fmt(monthlyIncome)}     color="var(--success)" />
        <Stat label="บิลประจำ"  value={'-' + fmt(fixedExpense)}      color="var(--warning)" />
        <Stat label="ผ่อนหนี้"  value={'-' + fmt(debtPaymentNow)}    color="var(--accent-strong)" />
        <Stat label="ใช้ทั่วไป" value={'-' + fmt(avgVariableExpense)} color="var(--danger)" />
      </div>

      {/* Projection table */}
      <div style={{
        background: 'var(--background-soft)', border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-control)', overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '90px 1fr 90px 100px', gap: 10,
          padding: '8px 12px', background: 'var(--surface-muted)',
          fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--text-muted)',
          letterSpacing: '0.12em', textTransform: 'uppercase',
          borderBottom: '1px solid var(--hairline)',
        }}>
          <div>เดือน</div><div>หนี้ที่ active</div>
          <div style={{ textAlign: 'right' }}>Net</div>
          <div style={{ textAlign: 'right' }}>ยอดสะสม</div>
        </div>
        {projection.map((p, i) => {
          const [y, m] = p.ym.split('-').map(Number);
          return (
            <div key={p.ym} style={{
              display: 'grid', gridTemplateColumns: '90px 1fr 90px 100px', gap: 10,
              padding: '10px 12px', alignItems: 'center', fontSize: 12.5,
              borderBottom: i < projection.length - 1 ? '1px solid var(--hairline)' : 0,
            }}>
              <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--text-secondary)' }}>
                {THAI_MONTHS[m - 1]} {(y + 543).toString().slice(-2)}
              </span>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                {p.activeDebtsCount} หนี้ · {fmt(p.debt)}
              </span>
              <span style={{
                textAlign: 'right', fontFamily: 'var(--f-mono)', fontWeight: 600,
                color: p.net >= 0 ? 'var(--success)' : 'var(--danger)',
              }}>
                {p.net >= 0 ? '+' : '-'}{fmt(Math.abs(p.net))}
              </span>
              <span style={{
                textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 13, fontWeight: 600,
                color: p.cumulative >= 0 ? 'var(--text-primary)' : 'var(--danger)',
              }}>
                {p.cumulative >= 0 ? '+' : '-'}{fmt(Math.abs(p.cumulative))}
              </span>
            </div>
          );
        })}
      </div>

      {/* Verdict */}
      <div style={{
        marginTop: 12, padding: '10px 14px',
        background: finalCum >= 0 ? 'var(--success-soft)' : 'var(--danger-soft)',
        border: '1px solid ' + (finalCum >= 0 ? 'var(--success)' : 'var(--danger)'),
        borderRadius: 'var(--radius-control)', fontSize: 12.5,
      }}>
        {finalCum >= 0 ? (
          <>✅ <strong>มีเงินเหลือสะสม {fmt(finalCum)}</strong> ใน 3 เดือนหน้า (จากการคำนวณ baseline)</>
        ) : (
          <>⚠️ <strong>เงินจะติดลบ {fmt(Math.abs(finalCum))}</strong> ใน 3 เดือนหน้า — พิจารณาลดค่าใช้จ่ายหรือเพิ่มรายได้</>
        )}
        {willOverflow && finalCum >= 0 && ' · ⚠️ บางเดือนเงินอาจไม่พอ ดูตารางด้านบน'}
      </div>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  3. Emergency Fund Gauge
// ════════════════════════════════════════════════════════════════════════════
export function EmergencyFundCard({ coverage, accounts, onAccountToggle }) {
  const [picking, setPicking] = useState(false);
  // No scope filter: the emergency-fund flag applies to family accounts too,
  // and the caller already passes the accounts for the scope being viewed.
  const personalAccounts = accounts || [];

  const ringColor = coverage.status === 'safe' ? 'var(--success)' :
                    coverage.status === 'warning' ? 'var(--warning)' : 'var(--danger)';
  const ringBg = coverage.status === 'safe' ? 'var(--success-soft)' :
                 coverage.status === 'warning' ? 'var(--warning-soft)' : 'var(--danger-soft)';

  // Gauge: 0-6 months scale
  const monthsClamped = Math.min(6, coverage.months);
  const pct = (monthsClamped / 6) * 100;

  return (
    <Card>
      <CardHeader
        eyebrow="🛡 EMERGENCY FUND · กองทุนฉุกเฉิน"
        title="เพียงพอกี่เดือน?"
        action={
          <Button variant="ghost" size="sm" onClick={() => setPicking(p => !p)}>
            {picking ? '× เสร็จ' : '⚙ ตั้งบัญชี'}
          </Button>
        }
      />

      {/* Picker: toggle accounts as emergency_fund */}
      {picking && (
        <div style={{
          background: 'var(--background-soft)', border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-control)', padding: 12, marginBottom: 12,
        }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 8 }}>
            ติ๊กบัญชีที่ใช้เป็นกองทุนฉุกเฉิน
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {personalAccounts.map(a => (
              <label key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 10px', borderRadius: 'var(--radius-control)',
                background: a.is_emergency_fund ? 'var(--accent-soft)' : 'transparent',
                cursor: 'pointer', fontSize: 12.5,
              }}>
                <input type="checkbox" checked={!!a.is_emergency_fund}
                  onChange={async (e) => {
                    await updateAccount(a.id, { is_emergency_fund: e.target.checked });
                    onAccountToggle?.();
                  }}
                  style={{ accentColor: 'var(--accent)' }} />
                <span style={{ flex: 1, color: 'var(--text-primary)' }}>{a.name}</span>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  ฿{Number(a.balance || 0).toLocaleString('th', { maximumFractionDigits: 0 })}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Gauge visualization */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14 }}>
        <div style={{
          width: 100, height: 100, borderRadius: '50%',
          background: `conic-gradient(${ringColor} ${pct * 3.6}deg, var(--surface-muted) ${pct * 3.6}deg)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <div style={{
            width: 78, height: 78, borderRadius: '50%', background: 'var(--surface)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--hairline)',
          }}>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, color: ringColor, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {coverage.months.toFixed(1)}
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: 2 }}>
              เดือน
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 19, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>
            {fmt(coverage.total)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {coverage.message}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Badge tone={coverage.status === 'safe' ? 'success' : coverage.status === 'warning' ? 'warning' : 'danger'} size="sm">
              {coverage.status === 'safe' ? '✅ ปลอดภัย' : coverage.status === 'warning' ? '⚠️ พอใช้' : '🚨 ต้องเก็บเพิ่ม'}
            </Badge>
            {coverage.accountsCount > 0 && (
              <Badge tone="neutral" size="sm">{coverage.accountsCount} บัญชี</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Target gap */}
      {coverage.targetGap6 > 0 && (
        <div style={{
          padding: '8px 12px', background: ringBg, border: '1px solid ' + ringColor,
          borderRadius: 'var(--radius-control)', fontSize: 12, color: 'var(--text-primary)',
        }}>
          🎯 ขาดอีก <strong>{fmt(coverage.targetGap6)}</strong> เพื่อครอบคลุม 6 เดือน
          {coverage.target6 > 0 && (
            <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontFamily: 'var(--f-mono)', fontSize: 11 }}>
              (target: {fmt(coverage.target6)})
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Reusable ───────────────────────────────────────────────────────────────
function Stat({ label, value, color = 'var(--text-primary)' }) {
  return (
    <div style={{
      padding: '8px 10px', background: 'var(--background-soft)',
      border: '1px solid var(--hairline)', borderRadius: 'var(--radius-control)',
    }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 15, color, fontWeight: 600, marginTop: 2, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

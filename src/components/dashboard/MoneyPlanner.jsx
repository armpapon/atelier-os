import { useMemo, useState } from 'react';
import {
  planDebts, comparePayoff, paymentBelowInterest, MONTH_CAP,
} from '../../lib/moneyPlanner.js';
import { rolloverOpportunities } from '../../lib/debtAdvice.js';
import { currentYearMonth } from '../../lib/api/finance.js';
import { formatThaiMonth } from './MonthNav.jsx';

// ── Month OFFSET → Thai Buddhist-year label ──────────────────────────────────
// The engine speaks in offsets from the current month (1 = next month). The
// calendar lives HERE: anchor on the current Bangkok month, add the offset,
// hand the resulting YYYY-MM to formatThaiMonth (which adds the +543 BE year).
function monthOffsetLabel(offset) {
  if (offset == null) return null;
  const [by, bm] = currentYearMonth().split('-').map(Number);
  const t = (bm - 1) + offset;                 // 0-indexed month + offset
  const y = by + Math.floor(t / 12);
  const m = ((t % 12) + 12) % 12;              // 0-indexed, wrapped
  return formatThaiMonth(`${y}-${String(m + 1).padStart(2, '0')}`);
}

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const baht = (n) => '฿' + fmt(Math.round(Number(n || 0)));

// prefers-reduced-motion — checked once, guarded for jsdom (no matchMedia).
const REDUCE_MOTION =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

const SLIDER_MAX = 20000;
const SLIDER_STEP = 500;
const DEFAULT_EXTRA = 5000;

const MONO_LBL = {
  fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
};
const HAIRLINE = '1px solid var(--hairline)';

// ════════════════════════════════════════════════════════════════════════════
//  Money Planner — payoff simulator on the หนี้ tab, between DebtAdvice and
//  DebtTracker. Reads the same `debts` for the scope; simulates avalanche +
//  rollover over ALL filled-in debts. Renders nothing when there is nothing to
//  plan (no debt has both a rate and a balance).
// ════════════════════════════════════════════════════════════════════════════
export function MoneyPlanner({ debts }) {
  const [extra, setExtra] = useState(DEFAULT_EXTRA);

  const plan = useMemo(() => planDebts(debts), [debts]);
  const cmp = useMemo(() => comparePayoff(debts, extra), [debts, extra]);
  const belowInterest = useMemo(() => paymentBelowInterest(debts), [debts]);

  // A rollover about to free a real monthly payment → offer it as a preset.
  const rollover = useMemo(() => {
    const [first] = rolloverOpportunities(debts);
    return first && first.freesPerMonth > 0 ? first : null;
  }, [debts]);

  if (plan.length < 1) return null;

  const poolFloor = plan.reduce((s, d) => s + (Number(d.monthly_payment) || 0), 0);
  const { plan: planRun, baseline, interestSaved, monthsSaved } = cmp;

  // Presets: minimum, +5k, +10k, and (when available) the rollover money.
  const presets = [
    { v: 0, label: 'จ่ายขั้นต่ำ' },
    { v: 5000, label: '+5,000' },
    { v: 10000, label: '+10,000' },
  ];
  if (rollover) {
    presets.push({
      v: Math.min(SLIDER_MAX, Math.round(rollover.freesPerMonth)),
      label: `+${fmt(Math.round(rollover.freesPerMonth))} (เงินจาก ${rollover.debt.name})`,
    });
  }

  const freeLabel = monthOffsetLabel(planRun.monthsToAllClear) || 'นานเกิน 60 ปี';
  const baseLabel = monthOffsetLabel(baseline.monthsToAllClear) || 'นานเกิน 60 ปี';

  const freeSub = monthsSaved > 0
    ? `เร็วขึ้น ${monthsSaved} เดือน (จ่ายขั้นต่ำ = ${baseLabel})`
    : planRun.monthsToAllClear != null
      ? `ใน ${planRun.monthsToAllClear} เดือน`
      : 'ยังไม่ปลดภายใน 60 ปี';

  // Timeline scale — baseline months is the widest the bars ever need to span.
  const maxMonths = Math.max(baseline.monthsToAllClear ?? MONTH_CAP, 1);
  const barTransition = REDUCE_MOTION ? 'none' : 'width 260ms ease';

  return (
    <div
      data-money-planner
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)',
        padding: 22, marginBottom: 14,
      }}
    >
      {/* Focus note — what's being simulated */}
      <div style={{ ...MONO_LBL, marginBottom: 6 }}>วางแผนโปะหนี้</div>
      <div style={{
        fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55,
        background: 'var(--background-soft)', border: HAIRLINE,
        borderRadius: 12, padding: '10px 13px', marginBottom: 4,
      }}>
        รวม <b style={{ color: 'var(--text-primary)' }}>หนี้ที่กรอกครบ {plan.length} ก้อน</b> ·
        จ่ายรวม <b style={{ color: 'var(--text-primary)' }}>{baht(poolFloor)}/เดือน</b> —
        วิธี avalanche: โปะก้อนดอกสูงสุดก่อน พอจบทบเงินงวดไปก้อนถัดไป (การ์ดคำแนะนำด้านบนใช้ลำดับเดียวกัน)
      </div>

      {/* Slider */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        margin: '20px 0 8px',
      }}>
        <span style={MONO_LBL}>เพิ่มเงินโปะต่อเดือน</span>
        <span data-extra-value style={{
          fontFamily: 'var(--f-body)', fontSize: 17, fontWeight: 800,
          color: 'var(--accent-strong)', fontVariantNumeric: 'tabular-nums',
        }}>{(extra > 0 ? '+' : '') + fmt(extra)}฿</span>
      </div>
      <input
        type="range" data-extra-slider
        min={0} max={SLIDER_MAX} step={SLIDER_STEP} value={extra}
        onChange={(e) => setExtra(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)', height: 26 }}
      />

      {/* Preset chips */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
        {presets.map((p) => {
          const on = p.v === extra;
          return (
            <button
              key={p.label} data-preset={p.v}
              onClick={() => setExtra(p.v)}
              style={{
                border: `1px solid ${on ? 'var(--text-primary)' : 'var(--border-strong)'}`,
                background: on ? 'var(--text-primary)' : 'var(--surface)',
                color: on ? 'var(--text-inverse)' : 'var(--text-secondary)',
                borderRadius: 999, padding: '5px 13px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--f-body)',
              }}
            >{p.label}</button>
          );
        })}
      </div>

      {/* Result tiles */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 22,
      }}>
        <div data-tile-clear style={{
          background: 'var(--background-soft)', border: HAIRLINE,
          borderRadius: 14, padding: '15px 16px',
        }}>
          <div style={{ ...MONO_LBL, fontSize: 9.5, letterSpacing: '0.14em' }}>ปลดหนี้ทุกก้อนหมด</div>
          <div data-clear-date style={{
            fontSize: 23, fontWeight: 800, letterSpacing: '-0.01em', marginTop: 6,
            color: 'var(--success)',
          }}>{freeLabel}</div>
          <div data-clear-sub style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            {freeSub}
          </div>
        </div>

        <div data-tile-saved style={{
          background: 'var(--background-soft)', border: HAIRLINE,
          borderRadius: 14, padding: '15px 16px',
        }}>
          <div style={{ ...MONO_LBL, fontSize: 9.5, letterSpacing: '0.14em' }}>ประหยัดดอกเบี้ย</div>
          <div data-interest-saved style={{
            fontSize: 23, fontWeight: 800, letterSpacing: '-0.01em', marginTop: 6,
            color: 'var(--accent-strong)', fontVariantNumeric: 'tabular-nums',
          }}>{baht(interestSaved)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            จ่ายดอกรวม {baht(planRun.totalInterest)} (ขั้นต่ำ {baht(baseline.totalInterest)})
          </div>
        </div>
      </div>

      {/* Per-debt timeline */}
      <div style={{ marginTop: 20 }}>
        {planRun.perDebt.map((d) => {
          const when = d.clearedMonth;
          const pct = Math.max(6, 100 - (when / maxMonths * 100));
          return (
            <div key={d.id} data-timeline-row style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '9px 0', borderBottom: HAIRLINE,
            }}>
              <div style={{
                fontSize: 13.5, fontWeight: 700, width: 130, flex: 'none',
                color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{d.name}</div>
              <div style={{
                flex: 1, height: 9, background: 'var(--surface-muted)',
                borderRadius: 999, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: `${pct}%`, background: 'var(--accent)',
                  borderRadius: 999, transition: barTransition,
                }} />
              </div>
              <div data-timeline-when style={{
                fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 700,
                color: 'var(--success)', whiteSpace: 'nowrap', width: 96, textAlign: 'right', flex: 'none',
              }}>{monthOffsetLabel(when)}</div>
            </div>
          );
        })}
      </div>

      {/* Data-observation note — payment(s) below their monthly interest */}
      {belowInterest.length > 0 && (
        <div data-below-interest style={{
          marginTop: 18, paddingTop: 14, borderTop: HAIRLINE,
          fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
        }}>
          <b style={{ color: 'var(--warning)' }}>⚠️ ข้อสังเกตจากข้อมูล:</b>{' '}
          {belowInterest.map((o, i) => (
            <span key={o.id}>
              {i > 0 && ' · '}
              ค่างวด <b style={{ color: 'var(--text-secondary)' }}>{o.name}</b> {baht(o.monthlyPayment)}/เดือน
              {' '}<b style={{ color: 'var(--text-secondary)' }}>ต่ำกว่าดอกเบี้ยต่อเดือน (~{baht(o.monthlyInterest)})</b>
            </span>
          ))}
          {' '}— ยอดจะยังไม่ลดจนกว่าจะโปะก้อนดอกสูงจบแล้วทบเงินงวดมา (ซึ่ง avalanche ทำให้เอง)
          {' '}· ถ้าค่างวด/อัตราดอกจริงไม่ตรง แก้ในหน้าหนี้ให้ตรง แล้วแผนจะแม่นขึ้น
        </div>
      )}
    </div>
  );
}

import { useMemo, useRef, useState } from 'react';
import {
  planDebts, comparePayoff, paymentBelowInterest, MONTH_CAP,
} from '../../lib/moneyPlanner.js';
import { currentYearMonth } from '../../lib/api/finance.js';
import { formatThaiMonth } from './MonthNav.jsx';
import { Icon } from '../Icon.jsx';
import { SectionCaption, Pill, NUM } from './InsetList.jsx';

// ── Month OFFSET → Thai Buddhist-year label ──────────────────────────────────
// The engine speaks in offsets from the current month (1 = next month). The
// calendar lives HERE: anchor on the current Bangkok month, add the offset,
// hand the resulting YYYY-MM to formatThaiMonth (which adds the +543 BE year).
export function monthOffsetLabel(offset) {
  if (offset == null) return null;
  const [by, bm] = currentYearMonth().split('-').map(Number);
  const t = (bm - 1) + offset;                 // 0-indexed month + offset
  const y = by + Math.floor(t / 12);
  const m = ((t % 12) + 12) % 12;              // 0-indexed, wrapped
  return formatThaiMonth(`${y}-${String(m + 1).padStart(2, '0')}`);
}

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const baht = (n) => '฿' + fmt(Math.round(Number(n || 0)));

/**
 * How much of the household's real debt the simulator can actually speak for
 * (audit A12 · 1).
 *
 * `planDebts()` silently drops any active debt with no readable rate — and when
 * it drops ALL of them `simulatePayoff` returns monthsToAllClear: 0, which the
 * หนี้ hero used to print as "หมดหนี้ <this month>" while ฿120,000 was still
 * owed. Nothing downstream may render a payoff DATE unless this says complete.
 *
 * An "outstanding" debt is an ACTIVE debt that still owes something, measured
 * the same way summarizeDebts measures it: a stored remaining_balance when there
 * is one, otherwise the instalments left × the monthly payment.
 *
 * Returns { planned, outstanding, missing: [rows], complete }:
 *   · complete is TRUE only when there is at least one outstanding debt and the
 *     plan covers every one of them. No debt at all → complete: false, because
 *     "หมดหนี้ <date>" is not a claim to make about an empty ledger either.
 * Pure read over the rows the page already loaded — no fetch, no Date.
 */
export function payoffCoverage(debts = []) {
  const owed = (d) => {
    const bal = Number(d?.remaining_balance);
    if (d?.remaining_balance != null && Number.isFinite(bal)) return Math.max(0, bal);
    const total = Number(d?.total_months);
    if (Number.isFinite(total) && total > 0) {
      const left = Math.max(0, total - (Number(d?.months_paid) || 0));
      return left * (Number(d?.monthly_payment) || 0);
    }
    return 0;
  };
  const outstanding = (debts || []).filter(d => d && d.is_active !== false && owed(d) > 0);
  const plannedIds = new Set(planDebts(debts).map(d => d.id));
  const missing = outstanding.filter(d => !plannedIds.has(d.id));
  return {
    planned: outstanding.length - missing.length,
    outstanding: outstanding.length,
    missing,
    complete: outstanding.length > 0 && missing.length === 0,
  };
}

// prefers-reduced-motion — checked once, guarded for jsdom (no matchMedia).
const REDUCE_MOTION =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

const SLIDER_MAX = 20000;
const SLIDER_STEP = 500;
export const DEFAULT_EXTRA = 5000;

const HAIRLINE = '1px solid var(--hairline)';

// ── Phase 3 chrome: two result cells side by side, hairline-split ────────────
const CELL     = { background: 'var(--background-soft)', padding: '12px 14px' };
const CELL_K   = { fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)' };
const CELL_V   = {
  fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 3,
  fontVariantNumeric: 'tabular-nums',
};
const CELL_SUB = { fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.45 };

// ════════════════════════════════════════════════════════════════════════════
//  Money Planner — payoff simulator on the หนี้ tab, between DebtAdvice and
//  DebtTracker. Reads the same `debts` for the scope; simulates avalanche +
//  rollover over ALL filled-in debts. Renders nothing when there is nothing to
//  plan (no debt has both a rate and a balance).
// ════════════════════════════════════════════════════════════════════════════
export function MoneyPlanner({ debts, extra: extraProp, onExtraChange }) {
  // Optionally CONTROLLED (v4.59). FinanceView passes the value so the หนี้
  // hero's "หมดหนี้" stat and this slider read one number; with neither prop
  // the card keeps its own state exactly as it did in v4.48.
  const [localExtra, setLocalExtra] = useState(DEFAULT_EXTRA);
  // Which mode this instance is in is decided ONCE, on the first render. Letting
  // it flip mid-life would drop the card back onto a stale local value the user
  // never chose (audit A12 · A12.2 latent note).
  const controlled = useRef(extraProp !== undefined).current;
  const extra = controlled ? extraProp : localExtra;
  const setExtra = (v) => { if (!controlled) setLocalExtra(v); onExtraChange?.(v); };

  const plan = useMemo(() => planDebts(debts), [debts]);
  const coverage = useMemo(() => payoffCoverage(debts), [debts]);
  const cmp = useMemo(() => comparePayoff(debts, extra), [debts, extra]);
  const belowInterest = useMemo(() => paymentBelowInterest(debts), [debts]);

  if (plan.length < 1) return null;

  const poolFloor = plan.reduce((s, d) => s + (Number(d.monthly_payment) || 0), 0);
  const { plan: planRun, baseline, interestSaved, monthsSaved, censored } = cmp;

  // Presets: minimum, +5k, +10k, +20k — every value ≤ SLIDER_MAX and equal to
  // its own label (no rollover preset: the simulator's automatic rollover
  // already frees a cleared debt's payment into the pool, so adding it again as
  // "extra" double-counts and applies before the cash is free — A9 · Major 2).
  const presets = [
    { v: 0, label: 'จ่ายขั้นต่ำ' },
    { v: 5000, label: '+5,000' },
    { v: 10000, label: '+10,000' },
    { v: 20000, label: '+20,000' },
  ];

  const freeLabel = monthOffsetLabel(planRun.monthsToAllClear) || 'นานเกิน 60 ปี';
  const baseLabel = monthOffsetLabel(baseline.monthsToAllClear) || 'นานเกิน 60 ปี';

  // When the comparison is censored (a run doesn't clear within 60 years) the
  // true savings are UNKNOWN — never show a fabricated ฿/month figure.
  const freeSub = censored
    ? 'เทียบไม่ได้ · แผนนี้ใช้เวลานานเกิน 60 ปี'
    : monthsSaved > 0
      ? `เร็วขึ้น ${monthsSaved} เดือน (จ่ายขั้นต่ำ = ${baseLabel})`
      : planRun.monthsToAllClear != null
        ? `ใน ${planRun.monthsToAllClear} เดือน`
        : 'ยังไม่ปลดภายใน 60 ปี';

  const barTransition = REDUCE_MOTION ? 'none' : 'width 260ms ease';

  return (
    <div data-money-planner style={{ marginBottom: 14 }}>
      <SectionCaption
        action={!coverage.complete ? (
          <span data-plan-scope style={{ fontSize: 12.5, color: 'var(--accent-strong)', ...NUM }}>
            เฉพาะหนี้ที่กรอกครบ {coverage.planned} จาก {coverage.outstanding} ก้อน
          </span>
        ) : null}>
        ลองวางแผนโปะ
      </SectionCaption>
      <div style={{
        background: 'var(--surface)', border: 'none',
        borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)',
        padding: '18px 18px 20px',
      }}>
        {/* What is being simulated — the facts, not a lecture */}
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          เพิ่มเงินโปะต่อเดือน
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.5, ...NUM }}>
          โปะก้อนดอกแพงสุดก่อน แล้วหมุนค่างวดที่ว่างลงก้อนถัดไป ·
          {' '}หนี้ที่กรอกครบ {plan.length} ก้อน · จ่ายรวม {baht(poolFloor)}/เดือน
        </div>

        {/* The slider and its one big number */}
        <div data-extra-value style={{
          fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em',
          color: 'var(--accent-strong)', margin: '12px 0 2px', ...NUM,
        }}>
          {(extra > 0 ? '+' : '') + baht(extra)}
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}> /เดือน</span>
        </div>
        {/* The visible heading above IS the slider's label; aria-label repeats
            it on the control itself so the name survives any reflow (A9·Minor 7). */}
        <input
          id="mp-extra-slider" type="range" data-extra-slider
          aria-label="เพิ่มเงินโปะต่อเดือน"
          min={0} max={SLIDER_MAX} step={SLIDER_STEP} value={extra}
          onChange={(e) => setExtra(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent)', height: 26, margin: '10px 0 4px' }}
        />

        {/* The scale under the rail doubles as the preset stops */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          {presets.map((p) => {
            const on = p.v === extra;
            return (
              <button
                key={p.label} data-preset={p.v} type="button" className="focus-ring"
                onClick={() => setExtra(p.v)}
                style={{
                  border: 0, background: 'transparent', cursor: 'pointer',
                  padding: '2px 4px', font: 'inherit', fontSize: 11.5,
                  fontWeight: on ? 700 : 500,
                  color: on ? 'var(--accent-strong)' : 'var(--text-muted)',
                  ...NUM,
                }}
              >{p.label}</button>
            );
          })}
        </div>

        {/* Two results, and only two */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
          background: 'var(--hairline)', borderRadius: 12, overflow: 'hidden',
          marginTop: 15,
        }}>
          <div data-tile-clear style={CELL}>
            <div style={CELL_K}>หมดหนี้ทุกก้อน</div>
            <div data-clear-date style={{ ...CELL_V, color: 'var(--success)' }}>{freeLabel}</div>
            <div data-clear-sub style={CELL_SUB}>{freeSub}</div>
          </div>
          <div data-tile-saved style={CELL}>
            <div style={CELL_K}>ประหยัดดอกเบี้ย</div>
            {censored ? (
              <>
                <div data-interest-saved style={{ ...CELL_V, fontSize: 16, color: 'var(--text-muted)' }}>
                  เทียบไม่ได้
                </div>
                <div style={CELL_SUB}>แผนนี้ใช้เวลานานเกิน 60 ปี</div>
              </>
            ) : (
              <>
                <div data-interest-saved style={{ ...CELL_V, color: 'var(--accent-strong)' }}>
                  {baht(interestSaved)}
                </div>
                <div style={CELL_SUB}>
                  จ่ายดอกรวม {baht(planRun.totalInterest)} (ขั้นต่ำ {baht(baseline.totalInterest)})
                </div>
              </>
            )}
          </div>
        </div>

        {/* The scope of BOTH figures above and the chips below. Without this the
            grid reads as "หมดหนี้ทุกก้อน" while a debt is missing from the run
            entirely (audit A12 · 1). */}
        {!coverage.complete && (
          <div data-plan-scope-note style={{
            fontSize: 12.5, color: 'var(--accent-strong)', marginTop: 10, lineHeight: 1.5, ...NUM,
          }}>
            <Pill tone="info">กรอกเพิ่ม</Pill>
            ตัวเลขและวันข้างบนนับเฉพาะหนี้ที่กรอกครบ {coverage.planned} จาก {coverage.outstanding} ก้อน
            {coverage.missing.length > 0 && ` — ยังไม่รวม ${coverage.missing.map(d => d.name).join(', ')}`}
          </div>
        )}

        {/* Per-debt timeline — one chip per debt, in the order they clear */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {planRun.perDebt.map((d) => {
            const cleared = d.clearedMonth != null;
            return (
              <span key={d.id} data-timeline-row style={{
                fontSize: 12.5, fontWeight: 600, borderRadius: 999,
                background: 'var(--fill)', color: 'var(--text-secondary)',
                padding: '4px 11px', transition: barTransition,
              }}>
                {d.name} หมด{' '}
                <b data-timeline-when style={{
                  color: cleared ? 'var(--text-primary)' : 'var(--text-muted)', ...NUM,
                }}>{cleared ? monthOffsetLabel(d.clearedMonth) : 'เกิน 60 ปี'}</b>
              </span>
            );
          })}
        </div>

  {/* Data-observation note — payment(s) below their monthly interest */}
      {belowInterest.length > 0 && (
        <div data-below-interest style={{
          marginTop: 18, paddingTop: 14, borderTop: HAIRLINE,
          fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
        }}>
          <b style={{ color: 'var(--warning)' }}><Icon name="warning" size={13} /> ข้อสังเกตจากข้อมูล:</b>{' '}
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
    </div>
  );
}

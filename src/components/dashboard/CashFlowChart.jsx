import { useState } from 'react';
import { EmptyState } from '../ui/index.js';
import { chartGeometry, barPath, monthReadout, resolveSelection, averageMonthlyNet } from '../../lib/cashflow.js';
import { Icon } from '../Icon.jsx';
import { SectionCaption } from './InsetList.jsx';

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function fmtYM(ym) {
  if (!ym) return '';
  const [, m] = ym.split('-').map(Number);
  return THAI_MONTHS_SHORT[m - 1] || '';
}

/** 'ส.ค. 2569' — short Thai month + Buddhist year, matching MonthNav. */
function fmtYMLong(ym) {
  if (!ym) return '';
  const [y] = ym.split('-').map(Number);
  return `${fmtYM(ym)} ${y + 543}`;
}

const baht = (n) => '฿' + Math.round(Math.abs(Number(n) || 0)).toLocaleString('th');

const NUM = { fontVariantNumeric: 'tabular-nums' };

// The phase-3 chart chrome: one inset panel, no card header, no axis furniture.
const PANEL = {
  background: 'var(--surface)', borderRadius: 16,
  boxShadow: 'var(--shadow-card)', padding: '16px 16px 12px',
};

/**
 * 12-month cash flow chart — income vs expense bars over a window that is
 * ANCHORED TO THE CURRENT MONTH and never moves when you pick a month.
 *
 * The per-month figures live in an always-visible strip below the plot (the
 * old chart hid them behind a hover tooltip, i.e. nowhere on touch). The
 * savings rate is a number in that strip, not a line in the plot — it used to
 * share the baht y-axis, which is two scales on one axis.
 *
 * Props:
 *  - data: [{ ym, income, expense, … }] — the FIXED window, oldest → newest,
 *    ending at the current month (build it with cashflowSeries()).
 *  - selectedYm: the highlighted month. Outside the window it falls back to
 *    the current month.
 *  - currentYm: today's month (Bangkok) — gets the accent dot.
 *  - onMonthClick: (ym) => void
 */
export function CashFlowChart({ data, selectedYm, currentYm, onMonthClick }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  const hasData = data?.some(d => d.income > 0 || d.expense > 0);
  if (!data?.length || !hasData) {
    return (
      <div>
        <SectionCaption>กระแสเงินสด 12 เดือน</SectionCaption>
        <div style={PANEL}>
          <EmptyState
            icon={<Icon name="trade" size={20} />}
            title="ยังไม่มีข้อมูลย้อนหลัง"
            description="เมื่อมีรายรับ-รายจ่ายในเดือนต่าง ๆ จะเห็นกราฟ 12 เดือนล่าสุด"
            compact
          />
        </div>
      </div>
    );
  }

  // The axis gutter is gone with the gridlines (phase 3), so the plot reclaims it.
  const g = chartGeometry(data, { padL: 10 });
  const selIdx = resolveSelection(data, selectedYm);
  const sel = monthReadout(data, selectedYm);
  const todayYm = currentYm || data[data.length - 1].ym;

  const pick = (i) => {
    const d = data[Math.max(0, Math.min(data.length - 1, i))];
    if (d) onMonthClick?.(d.ym);
  };

  // The headline the axis labels used to carry. The maths lives in cashflow.js
  // and the label says which months it divided by — a bare "เฉลี่ย/เดือน" over
  // a 12-slot window would have been a different number (audit A12 · 3).
  const avgNet = averageMonthlyNet(data);

  return (
    <div>
      <SectionCaption>กระแสเงินสด 12 เดือน</SectionCaption>
      <div style={PANEL}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          gap: 12, flexWrap: 'wrap', marginBottom: 4,
        }}>
          {avgNet.monthsCounted > 0 && (
            <span data-avg-readout style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', ...NUM }}>
              {avgNet.avg >= 0 ? 'เฉลี่ยเดือนที่มีรายการ เหลือ ' : 'เฉลี่ยเดือนที่มีรายการ ขาด '}
              {baht(avgNet.avg)}/เดือน
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
                {' '}({avgNet.monthsCounted} จาก {avgNet.windowMonths} เดือน)
              </span>
            </span>
          )}
          <span style={{ display: 'flex', gap: 14 }}>
            <Legend color="var(--chart-income)"  label="รายรับ" />
            <Legend color="var(--chart-expense)" label="รายจ่าย" />
          </span>
        </div>

      <svg
        viewBox={`0 0 ${g.W} ${g.H}`}
        width="100%"
        style={{ display: 'block', maxWidth: '100%', ...NUM }}
        role="img"
        aria-label="กราฟรายรับรายจ่าย 12 เดือนล่าสุด"
      >
        {g.bars.map((b, i) => {
          const d = data[i];
          const isSel   = i === selIdx;
          const isHover = i === hoverIdx;
          const op = isSel ? 1 : isHover ? 0.9 : 0.7;
          return (
            <g key={b.ym}
              data-month={b.ym}
              data-selected={isSel ? 'true' : 'false'}
              role="button"
              tabIndex={0}
              aria-label={`${fmtYMLong(b.ym)} รายรับ ${baht(d.income)} รายจ่าย ${baht(d.expense)}`}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onClick={() => onMonthClick?.(b.ym)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMonthClick?.(b.ym); }
              }}
              style={{ cursor: onMonthClick ? 'pointer' : 'default' }}>

              {/* selected column wash */}
              {isSel && (
                <rect x={b.x + 2} y={g.padT - 6} width={b.groupW - 4} height={g.innerH + 10}
                  rx="8" fill="var(--accent-tint)" />
              )}
              {/* hit area — the whole column, label row included */}
              <rect x={b.x} y={g.padT - 6} width={b.groupW} height={g.innerH + 32}
                fill={!isSel && isHover ? 'var(--fill)' : 'transparent'} rx="8" />

              <path d={barPath(b.income.x,  b.income.y,  b.income.w,  b.income.h,  g.barRadius)}
                fill="var(--chart-income)" opacity={op} />
              <path d={barPath(b.expense.x, b.expense.y, b.expense.w, b.expense.h, g.barRadius)}
                fill="var(--chart-expense)" opacity={op} />

              <text x={b.cx} y={g.labelY} textAnchor="middle" fontSize="10.5"
                fill={isSel ? 'var(--accent-strong)' : 'var(--text-secondary)'}
                fontWeight={isSel ? 700 : 400}>
                {fmtYM(b.ym)}
              </text>
              {/* current-month tick */}
              {b.ym === todayYm && <circle cx={b.cx} cy={g.dotY} r="1.8" fill="var(--accent)" />}

              {/* pointer-device affordance — native tooltip, no layout risk */}
              <title>{`${fmtYMLong(b.ym)} · รายรับ ${baht(d.income)} · รายจ่าย ${baht(d.expense)}`}</title>
            </g>
          );
        })}
      </svg>

        {sel && <SummaryStrip sel={sel} todayYm={todayYm} data={data} pick={pick} onMonthClick={onMonthClick} />}
      </div>
    </div>
  );
}

/** The always-visible readout for the selected month. Primary, not a tooltip. */
function SummaryStrip({ sel, todayYm, data, pick, onMonthClick }) {
  const netPositive = sel.net >= 0;
  return (
    <div data-testid="cashflow-strip" style={{
      marginTop: 14, padding: '13px 15px',
      background: 'var(--fill)', borderRadius: 14,
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StepBtn label="เดือนก่อน" disabled={!sel.hasPrev} onClick={() => pick(sel.index - 1)}>‹</StepBtn>
        <b data-testid="cashflow-strip-month" style={{
          fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
          color: 'var(--text-primary)', minWidth: 78, textAlign: 'center', ...NUM,
        }}>{fmtYMLong(sel.ym)}</b>
        <StepBtn label="เดือนถัดไป" disabled={!sel.hasNext} onClick={() => pick(sel.index + 1)}>›</StepBtn>
      </div>

      <KV dot="var(--chart-income)" k="รายรับ" v={baht(sel.income)} />
      <KV dot="var(--chart-expense)" k="รายจ่าย" v={baht(sel.expense)} delta={sel.expenseDelta} />
      <KV k="คงเหลือ"
        v={(netPositive ? '+' : '−') + baht(sel.net)}
        color={netPositive ? 'var(--chart-income)' : 'var(--chart-expense)'} />
      <KV k="ออม" v={`${Math.round(sel.savingsRate)}%`} />

      {!sel.isCurrent && (
        <button
          type="button"
          onClick={() => onMonthClick?.(todayYm)}
          style={{
            marginLeft: 'auto', border: 0, cursor: 'pointer',
            background: 'var(--accent-tint)', color: 'var(--accent-strong)',
            font: 'inherit', fontSize: 12, fontWeight: 600,
            padding: '6px 14px', borderRadius: 99,
          }}>↩ เดือนนี้</button>
      )}
    </div>
  );
}

function StepBtn({ children, label, onClick, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 24, height: 24, border: 0, borderRadius: '50%',
        background: 'var(--surface)', color: disabled ? 'var(--text-muted)' : 'var(--accent-strong)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
        fontSize: 13, lineHeight: 1, padding: 0,
        boxShadow: 'var(--shadow-soft, 0 1px 2px rgba(0,0,0,0.08))',
      }}>{children}</button>
  );
}

function KV({ dot, k, v, delta, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
        {dot && <i style={{ width: 8, height: 8, borderRadius: 2, background: dot, display: 'inline-block' }} />}
        {k}
      </span>
      <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em', color: color || 'var(--text-primary)', ...NUM }}>{v}</span>
      {delta != null && (
        <span style={{
          fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
          background: 'var(--fill-2)', color: 'var(--text-secondary)', ...NUM,
        }}>{delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(delta))}%</span>
      )}
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', fontSize: 11.5 }}>
      <span style={{ width: 9, height: 9, background: color, borderRadius: 3, display: 'inline-block' }} />
      {label}
    </div>
  );
}

export function EmptyChart({ label, height = 200 }) {
  return (
    <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums',
      background: 'var(--surface)', border: '1px dashed var(--hairline)',
      borderRadius: 'var(--radius-card)', padding: 20, height,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-muted)', fontSize: 13
    }}>{label}</div>
  );
}

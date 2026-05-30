import { useState } from 'react';
import { formatBaht } from './KPICard.jsx';
import { Card, CardHeader, EmptyState } from '../ui/index.js';

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function fmtYM(ym) {
  if (!ym) return '';
  const [, m] = ym.split('-').map(Number);
  return THAI_MONTHS_SHORT[m - 1];
}

/**
 * 12-month cash flow chart with income (green bars), expense (red bars),
 * and savings-rate line overlay (amber).
 *
 * Props:
 *  - data: [{ ym, income, expense, savingsRate }]
 *  - currentYm: highlight a specific month
 *  - onMonthClick: (ym) => void
 */
export function CashFlowChart({ data, currentYm, onMonthClick }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  // Check if there's any real data — avoid showing weird ฿0/฿1 axes
  const hasData = data?.some(d => d.income > 0 || d.expense > 0);
  if (!data?.length || !hasData) {
    return (
      <Card>
        <CardHeader eyebrow="Cash Flow · 12 เดือน" title="กระแสรายรับ-รายจ่าย" />
        <EmptyState
          icon="📈"
          title="ยังไม่มีข้อมูลย้อนหลัง"
          description="เมื่อมีรายรับ-รายจ่ายในเดือนต่าง ๆ จะเห็นกราฟ trend 12 เดือน + อัตราการออม"
          compact
        />
      </Card>
    );
  }

  // Layout
  const W = 720, H = 240;
  const padL = 50, padR = 18, padT = 18, padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxBar = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);
  const groupW = innerW / data.length;
  const barW   = Math.max(6, Math.min(18, (groupW - 8) / 2));

  // Y-axis tick values (5 lines)
  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => (maxBar * i) / ticks);

  // Savings rate line: maps 0-100% (or clamped) to chart height
  const srMin = Math.min(0, ...data.map(d => d.savingsRate));
  const srMax = Math.max(50, ...data.map(d => d.savingsRate));
  const srRange = srMax - srMin || 1;
  const srY = (rate) => padT + innerH - ((rate - srMin) / srRange) * innerH;

  const linePath = data.map((d, i) => {
    const x = padL + i * groupW + groupW / 2;
    const y = srY(d.savingsRate);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const hover = hoverIdx != null ? data[hoverIdx] : null;

  return (
    <Card>
      <CardHeader
        eyebrow="Cash Flow · 12 เดือนย้อนหลัง"
        title="กระแสรายรับ-รายจ่าย"
        meta="รายรับ · รายจ่าย · อัตราการออม"
        action={
          <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
            <Legend color="var(--success)" label="รายรับ" />
            <Legend color="var(--danger)"  label="รายจ่าย" />
            <Legend color="var(--accent)"  label="Savings %" dashed />
          </div>
        }
      />

      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
          {/* Y-axis grid + labels */}
          {yTicks.map((v, i) => {
            const y = padT + innerH - (v / maxBar) * innerH;
            return (
              <g key={i}>
                <line x1={padL} x2={W - padR} y1={y} y2={y}
                  stroke="var(--line)" strokeWidth="0.5" strokeDasharray="2 4" />
                <text x={padL - 8} y={y + 3} textAnchor="end"
                  fontSize="9" fill="var(--ink-3)" fontFamily="var(--f-mono)">
                  {formatBaht(v, { compact: true })}
                </text>
              </g>
            );
          })}

          {/* Bars per month */}
          {data.map((d, i) => {
            const x = padL + i * groupW;
            const ih = (d.income  / maxBar) * innerH;
            const eh = (d.expense / maxBar) * innerH;
            const isCur   = d.ym === currentYm;
            const isHover = i === hoverIdx;
            return (
              <g key={d.ym}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onClick={() => onMonthClick?.(d.ym)}
                style={{ cursor: onMonthClick ? 'pointer' : 'default' }}>
                {/* invisible hover area */}
                <rect x={x} y={padT} width={groupW} height={innerH}
                  fill={isCur ? 'rgba(212, 165, 116, 0.06)' : isHover ? 'rgba(255,255,255,0.03)' : 'transparent'} />
                {/* income bar */}
                <rect x={x + groupW/2 - barW - 1} y={padT + innerH - ih}
                  width={barW} height={ih}
                  fill="var(--profit)" opacity={isHover || isCur ? 1 : 0.8} rx="1" />
                {/* expense bar */}
                <rect x={x + groupW/2 + 1} y={padT + innerH - eh}
                  width={barW} height={eh}
                  fill="var(--loss)" opacity={isHover || isCur ? 1 : 0.8} rx="1" />
                {/* x-axis label */}
                <text x={x + groupW/2} y={H - padB + 14} textAnchor="middle"
                  fontSize="9.5" fill={isCur ? 'var(--amber)' : 'var(--ink-3)'}
                  fontFamily="var(--f-mono)" fontWeight={isCur ? 600 : 400}>
                  {fmtYM(d.ym)}
                </text>
              </g>
            );
          })}

          {/* Savings rate line */}
          <path d={linePath} stroke="var(--amber)" strokeWidth="1.5" fill="none"
            strokeDasharray="3 3" opacity="0.85" />
          {data.map((d, i) => {
            const x = padL + i * groupW + groupW / 2;
            const y = srY(d.savingsRate);
            return (
              <circle key={d.ym} cx={x} cy={y} r={i === hoverIdx ? 4 : 2.5}
                fill="var(--amber)" />
            );
          })}
        </svg>

        {/* Tooltip */}
        {hover && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: `${(padL + hoverIdx * groupW + groupW + 8) / W * 100}%`,
            background: '#0c0908', border: '1px solid var(--line)',
            borderRadius: 'var(--r-sm)', padding: '8px 10px',
            fontSize: 11, color: 'var(--ink)', fontFamily: 'var(--f-mono)',
            minWidth: 130, pointerEvents: 'none', zIndex: 10,
          }}>
            <div style={{ color: 'var(--ink-3)', marginBottom: 4, letterSpacing: '0.1em' }}>{fmtYM(hover.ym)}</div>
            <div style={{ color: 'var(--profit)' }}>+{formatBaht(hover.income, { compact: true })}</div>
            <div style={{ color: 'var(--loss)' }}>-{formatBaht(hover.expense, { compact: true })}</div>
            <div style={{ color: 'var(--amber)', marginTop: 3, paddingTop: 3, borderTop: '1px solid var(--line)' }}>
              ออม {hover.savingsRate.toFixed(0)}%
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function Legend({ color, label, dashed }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: 10.5, fontFamily: 'var(--f-mono)' }}>
      {dashed ? (
        <svg width="14" height="3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" /></svg>
      ) : (
        <span style={{ width: 10, height: 10, background: color, borderRadius: 2, display: 'inline-block' }} />
      )}
      {label}
    </div>
  );
}

export function EmptyChart({ label, height = 200 }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px dashed var(--line)',
      borderRadius: 'var(--r-lg)', padding: 20, height,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--ink-3)', fontFamily: 'var(--f-mono)', fontSize: 11,
    }}>{label}</div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { previousMonth, nextMonth, currentYearMonth } from '../../lib/api/finance.js';

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export function formatThaiMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

export function MonthNav({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const dropRef = useRef();
  const today = currentYearMonth();
  const [y, m] = value.split('-').map(Number);

  useEffect(() => {
    const onClick = (e) => { if (!dropRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Year list: last 5 years through this year
  const thisYear = parseInt(today.split('-')[0]);
  const years = [];
  for (let yr = thisYear - 4; yr <= thisYear + 1; yr++) years.push(yr);

  const isCurrent = value === today;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* Prev */}
      <button
        onClick={() => onChange(previousMonth(value))}
        title="เดือนก่อน"
        style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'transparent', border: 'none',
          color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 15,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 150ms, color 150ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--fill-2)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>‹</button>

      {/* Picker button */}
      <div ref={dropRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            minWidth: 140, padding: '7px 14px', borderRadius: 'var(--radius-btn)',
            background: 'var(--fill-2)', border: 'none',
            color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            fontFamily: 'var(--f-body)', fontSize: 13,
          }}>
          <span>{formatThaiMonth(value)}</span>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>▾</span>
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
            background: 'var(--surface)', border: 'none',
            borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)',
            padding: 12, minWidth: 280,
          }}>
            {/* Year row */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {years.map(yr => (
                <button key={yr}
                  onClick={() => onChange(`${yr}-${String(m).padStart(2, '0')}`)}
                  style={{
                    padding: '5px 10px', borderRadius: 'var(--radius-btn)',
                    background: yr === y ? 'var(--accent-fill)' : 'var(--fill)',
                    color: yr === y ? 'var(--text-inverse)' : 'var(--text-secondary)',
                    border: 'none', fontWeight: yr === y ? 600 : 500,
                    cursor: 'pointer', fontSize: 11, fontFamily: 'var(--f-mono)',
                    fontVariantNumeric: 'tabular-nums', minWidth: 56,
                  }}>{yr + 543}</button>
              ))}
            </div>
            {/* Month grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              {THAI_MONTHS.map((mn, i) => {
                const mi = i + 1;
                const sel = mi === m;
                const ymStr = `${y}-${String(mi).padStart(2, '0')}`;
                const isToday = ymStr === today;
                return (
                  <button key={mi}
                    onClick={() => { onChange(ymStr); setOpen(false); }}
                    style={{
                      padding: '8px 0', borderRadius: 8,
                      background: sel ? 'var(--accent-fill)' : isToday ? 'var(--accent-tint)' : 'transparent',
                      color: sel ? 'var(--text-inverse)' : isToday ? 'var(--accent-strong)' : 'var(--text-secondary)',
                      border: 'none', fontWeight: sel ? 600 : 500,
                      cursor: 'pointer', fontSize: 12,
                    }}>{mn}</button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Next */}
      <button
        onClick={() => onChange(nextMonth(value))}
        title="เดือนหน้า"
        style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'transparent', border: 'none',
          color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 15,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 150ms, color 150ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--fill-2)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>›</button>

      {/* Today button */}
      {!isCurrent && (
        <button
          onClick={() => onChange(today)}
          style={{
            fontVariantNumeric: 'tabular-nums',
            padding: '6px 13px', borderRadius: 'var(--radius-btn)',
            background: 'var(--accent-tint)', border: 'none',
            color: 'var(--accent-strong)', cursor: 'pointer', fontSize: 13, fontWeight: 600
          }}>วันนี้</button>
      )}
    </div>
  );
}

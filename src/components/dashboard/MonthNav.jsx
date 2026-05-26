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
          width: 32, height: 32, borderRadius: 'var(--r-sm)',
          background: 'var(--surface-2)', border: '1px solid var(--line)',
          color: 'var(--ink-2)', cursor: 'pointer', fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>‹</button>

      {/* Picker button */}
      <div ref={dropRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            minWidth: 140, padding: '8px 14px', borderRadius: 'var(--r-sm)',
            background: 'var(--surface-2)', border: '1px solid var(--line)',
            color: 'var(--ink)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            fontFamily: 'var(--f-body)', fontSize: 13,
          }}>
          <span>{formatThaiMonth(value)}</span>
          <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>▾</span>
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
            background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            padding: 12, minWidth: 280,
          }}>
            {/* Year row */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {years.map(yr => (
                <button key={yr}
                  onClick={() => onChange(`${yr}-${String(m).padStart(2, '0')}`)}
                  style={{
                    padding: '5px 10px', borderRadius: 4,
                    background: yr === y ? 'var(--amber)' : 'transparent',
                    color: yr === y ? '#1a1410' : 'var(--ink-2)',
                    border: '1px solid ' + (yr === y ? 'var(--amber)' : 'var(--line)'),
                    cursor: 'pointer', fontSize: 11, fontFamily: 'var(--f-mono)',
                    minWidth: 56,
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
                      padding: '8px 0', borderRadius: 4,
                      background: sel ? 'var(--amber)' : isToday ? 'var(--surface-2)' : 'transparent',
                      color: sel ? '#1a1410' : isToday ? 'var(--amber)' : 'var(--ink-2)',
                      border: '1px solid ' + (sel ? 'var(--amber)' : 'var(--line)'),
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
          width: 32, height: 32, borderRadius: 'var(--r-sm)',
          background: 'var(--surface-2)', border: '1px solid var(--line)',
          color: 'var(--ink-2)', cursor: 'pointer', fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>›</button>

      {/* Today button */}
      {!isCurrent && (
        <button
          onClick={() => onChange(today)}
          style={{
            padding: '7px 12px', borderRadius: 'var(--r-sm)',
            background: 'transparent', border: '1px solid var(--amber)',
            color: 'var(--amber)', cursor: 'pointer', fontSize: 11,
            fontFamily: 'var(--f-mono)', letterSpacing: '0.08em',
          }}>วันนี้</button>
      )}
    </div>
  );
}

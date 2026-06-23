import { useState, useMemo } from 'react';
import { Card } from '../ui/index.js';

const WEEKDAYS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']; // Monday-first

function ymd(y, m, d) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function money(n, withSign = true) {
  const s = n < 0 ? '-' : (withSign ? '+' : '');
  return `${s}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function PnLCalendar({ trades = [] }) {
  // Default to the month of the most recent trade (else today).
  const [month, setMonth] = useState(() => {
    const dates = trades.map(t => t.trade_date).filter(Boolean).sort();
    const base = dates.length ? new Date(dates[dates.length - 1] + 'T00:00:00') : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const y = month.getFullYear();
  const m = month.getMonth();

  // Per-day { pnl, count } for the visible month.
  const byDay = useMemo(() => {
    const map = {};
    for (const t of trades) {
      const d = t.trade_date;
      if (!d || d.substring(0, 7) !== `${y}-${String(m + 1).padStart(2, '0')}`) continue;
      if (!map[d]) map[d] = { pnl: 0, count: 0 };
      map[d].pnl += Number(t.pnl) || 0;
      map[d].count += 1;
    }
    return map;
  }, [trades, y, m]);

  const monthlyPnl = useMemo(
    () => Object.values(byDay).reduce((s, d) => s + d.pnl, 0),
    [byDay]
  );

  // Build week rows (Monday-first), each with 7 day-slots + a weekly total.
  const weeks = useMemo(() => {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const firstOffset = (new Date(y, m, 1).getDay() + 6) % 7; // Mon=0
    const cells = [];
    for (let i = 0; i < firstOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      const slots = cells.slice(i, i + 7);
      let weekTotal = 0, hasData = false;
      for (const d of slots) {
        if (d == null) continue;
        const info = byDay[ymd(y, m, d)];
        if (info) { weekTotal += info.pnl; hasData = true; }
      }
      rows.push({ slots, weekTotal, hasData });
    }
    return rows;
  }, [y, m, byDay]);

  const monthLabel = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const navBtn = { background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', padding: '0 8px', lineHeight: 1 };

  return (
    <Card>
      {/* Header: month nav + monthly total */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setMonth(new Date(y, m - 1, 1))} style={navBtn} aria-label="เดือนก่อน">‹</button>
          <span style={{ fontFamily: 'var(--f-display)', fontSize: 17, fontWeight: 500, minWidth: 150, textAlign: 'center' }}>{monthLabel}</span>
          <button onClick={() => setMonth(new Date(y, m + 1, 1))} style={navBtn} aria-label="เดือนถัดไป">›</button>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Monthly P&amp;L</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 22, fontWeight: 600, color: monthlyPnl >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
            {money(monthlyPnl)}
          </div>
        </div>
      </div>

      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr) 0.9fr', gap: 5, marginBottom: 5 }}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} style={{ textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{w}</div>
        ))}
        <div style={{ textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>สัปดาห์</div>
      </div>

      {/* Weeks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {weeks.map((wk, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr) 0.9fr', gap: 5 }}>
            {wk.slots.map((d, di) => {
              if (d == null) return <div key={di} />;
              const info = byDay[ymd(y, m, d)];
              const pos = info && info.pnl >= 0;
              return (
                <div key={di} style={{
                  minHeight: 62, borderRadius: 'var(--r-sm)', padding: '6px 7px',
                  border: '1px solid var(--line)',
                  background: info ? (pos ? 'var(--profit-bg)' : 'var(--loss-bg)') : 'var(--surface)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                }}>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)' }}>{d}</div>
                  {info && (
                    <div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, fontWeight: 600, color: pos ? 'var(--profit)' : 'var(--loss)' }}>
                        {money(info.pnl)}
                      </div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--ink-4)' }}>{info.count} trade</div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* Weekly total */}
            <div style={{
              minHeight: 62, borderRadius: 'var(--r-sm)', padding: '6px 7px',
              border: '1px solid var(--line)', background: 'var(--surface-2)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center',
            }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>Wk {wi + 1}</div>
              {wk.hasData && (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 600, color: wk.weekTotal >= 0 ? 'var(--profit)' : 'var(--loss)', marginTop: 2 }}>
                  {money(wk.weekTotal)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

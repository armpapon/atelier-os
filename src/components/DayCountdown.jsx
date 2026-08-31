import { useState, useEffect } from 'react';

const TOTAL_MIN = 1440; // minutes in a day
const R = 26;
const CIRC = 2 * Math.PI * R;

// A live countdown of the time left in today — a clock ring whose arc drains
// as the day passes, plus the minutes/seconds remaining. A daily nudge to feel
// the value of time (the day-scale companion to the Life Calendar).
export function DayCountdown() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const msLeft  = Math.max(0, end - now);
  const minLeft = Math.floor(msLeft / 60000);
  const secLeft = Math.floor((msLeft % 60000) / 1000);
  const hh = Math.floor(minLeft / 60);
  const mm = minLeft % 60;
  const remainFrac = msLeft / 86400000; // remaining fraction of the day

  const line =
    minLeft > 960 ? 'เช้านี้ยังเต็มไปด้วยเวลา — เลือกใช้ให้ดี'
    : minLeft > 600 ? 'วันยังยาว ใช้ให้คุ้ม'
    : minLeft > 300 ? 'ครึ่งหลังของวันแล้ว — โฟกัสสิ่งสำคัญ'
    : minLeft > 90  ? 'เหลือไม่มากแล้ว ทำสิ่งที่ตั้งใจให้เสร็จ'
    : 'ปลายวันแล้ว — ปิดวันนี้ให้สวย';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18,
      flexWrap: 'wrap',
      padding: '14px 18px', borderRadius: 'var(--radius-card)',
      background: 'var(--surface)', border: 'none', boxShadow: 'var(--shadow-card)',
    }}>
      {/* Clock ring */}
      <svg width="66" height="66" viewBox="0 0 66 66" style={{ flexShrink: 0 }}>
        <circle cx="33" cy="33" r={R} fill="none" stroke="var(--fill)" strokeWidth="5" />
        <circle cx="33" cy="33" r={R} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - remainFrac)}
          transform="rotate(-90 33 33)"
          style={{ transition: 'stroke-dashoffset 950ms linear' }} />
        <text x="33" y="32" textAnchor="middle" style={{ fontFamily: 'var(--f-mono)', fontSize: 16, fontWeight: 600, fill: 'var(--accent-strong)' }}>{minLeft}</text>
        <text x="33" y="44" textAnchor="middle" style={{ fontFamily: 'var(--f-mono)', fontSize: 7.5, fill: 'var(--ink-3)', letterSpacing: '0.1em' }}>นาที</text>
      </svg>

      {/* Time text */}
      <div style={{ flex: 1, minWidth: 130 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
          เหลือเวลาวันนี้
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 22, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>
          {String(hh).padStart(2, '0')}<span style={{ color: 'var(--ink-4)' }}>:</span>{String(mm).padStart(2, '0')}<span style={{ color: 'var(--ink-4)' }}>:</span>{String(secLeft).padStart(2, '0')}
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--ink-4)' }}>
          จาก 1,440 นาที
        </div>
      </div>

      {/* Nudge */}
      <div style={{
        flex: '1 1 200px', minWidth: 0, textAlign: 'right',
        fontSize: 13, fontWeight: 500, color: 'var(--ink-2)',
      }}>
        {line}
      </div>
    </div>
  );
}

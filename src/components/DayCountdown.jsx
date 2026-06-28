import { useState, useEffect } from 'react';

const TOTAL_MIN = 1440; // minutes in a day

// A slim live countdown of the minutes left in today — a daily nudge to feel
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
  const usedPct = ((TOTAL_MIN - minLeft) / TOTAL_MIN) * 100;
  const hh = Math.floor(minLeft / 60);
  const mm = minLeft % 60;

  const line =
    minLeft > 960 ? 'เช้านี้ยังเต็มไปด้วยเวลา — เลือกใช้ให้ดี'
    : minLeft > 600 ? 'วันยังยาว ใช้ให้คุ้ม'
    : minLeft > 300 ? 'ครึ่งหลังของวันแล้ว — โฟกัสสิ่งสำคัญ'
    : minLeft > 90  ? 'เหลือไม่มากแล้ว ทำสิ่งที่ตั้งใจให้เสร็จ'
    : 'ปลายวันแล้ว — ปิดวันนี้ให้สวย';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18,
      padding: '12px 18px', borderRadius: 'var(--r-lg)',
      background: 'var(--surface)', border: '1px solid var(--line)',
    }}>
      <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>⏳</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 24, fontWeight: 600, color: 'var(--amber-deep)', lineHeight: 1 }}>
            {minLeft.toLocaleString()}
          </span>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
            / {TOTAL_MIN.toLocaleString()} นาทีเหลือวันนี้ · {hh} ชม {mm} นาที {String(secLeft).padStart(2, '0')} วิ
          </span>
        </div>
        {/* progress of the day used */}
        <div style={{ height: 5, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 7 }}>
          <div style={{ width: `${usedPct}%`, height: '100%', background: 'var(--amber)', transition: 'width 900ms linear' }} />
        </div>
      </div>

      <div style={{
        flexShrink: 0, maxWidth: 220, textAlign: 'right',
        fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 13, color: 'var(--ink-3)',
      }}>
        {line}
      </div>
    </div>
  );
}

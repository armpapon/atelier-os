import { useState, useEffect } from 'react';
import { Card, CardHeader, Badge, Button } from '../ui/index.js';

// ─── HA-50 session window — Thai time (UTC+7), ไม่ต้องแปลง DST ────────────
// ระบบเดียว: XAUUSD · TF 1h · EMA50 + Heikin Ashi flip
// หน้าต่างเทรด = London ต่อ NY 14:00–23:00 ตามเวลาไทย
const SESSIONS = [
  {
    id: 'HA50', label: '🕑 London–NY',
    start: '14:00', end: '23:00',
    startMin: 14 * 60, endMin: 23 * 60,
    setup: 'ราคาอยู่ฝั่งถูกของ EMA 50 · รอ HA เปลี่ยนสีและปิดแท่ง · ออกเมื่อ HA เปลี่ยนสีกลับ',
    color: 'var(--accent-strong)',
  },
];

const MAX_LOSSES_PER_DAY = 3;

const CHECKLIST = [
  { id: 'ema',     text: 'ราคาอยู่ฝั่งถูกของ EMA 50 และ EMA ชันชัดเจน (ไม่มีพื้นเทาบนกราฟ)' },
  { id: 'pullback',text: 'มีขาย่อสีตรงข้ามมาก่อนอย่างน้อย 2 แท่ง HA' },
  { id: 'closed',  text: 'แท่งสัญญาณเปลี่ยนสีแล้ว *ปิดแท่งแล้ว* — ไม่เข้าก่อนแท่งปิด' },
  { id: 'wick',    text: 'แท่งสัญญาณไส้ฝั่งสวนสั้น' },
  { id: 'window',  text: 'อยู่ในช่วง 14:00–23:00 ไทย และวันนี้ไม่มีข่าวแดง (NFP / CPI / FOMC)' },
  { id: 'risk',    text: 'ตั้ง SL ตามระบบจากกราฟแท่งเทียนจริง และขนาดไม้ = เสี่ยง 1% พอดี' },
  { id: 'streak',  text: 'วันนี้ยังแพ้ไม่ถึง 3 ไม้' },
];

const RULES = [
  { tone: 'success', icon: '✅', text: 'ออกเมื่อแท่ง HA เปลี่ยนสีกลับและปิดแล้วเท่านั้น — ห้ามปิดก่อนเพราะกลัวกำไรหาย' },
  { tone: 'danger',  icon: '🛑', text: 'แพ้ 3 ไม้ในวันเดียว = ปิดจอทันที ห้ามแก้มือ' },
  { tone: 'danger',  icon: '🛑', text: 'ห้ามเพิ่ม lot เพราะอยากทวงทุนคืน — 1% ต่อไม้เสมอ' },
  { tone: 'danger',  icon: '🛑', text: 'EMA แบน / ราคาถักเปีย EMA = ไม่มีเทรดวันนั้นก็คือไม่มี' },
  { tone: 'success', icon: '✅', text: 'จดทุกไม้ภายในวันเดียวกัน ห้ามค้าง — ไม้ที่ไม่ได้จด = แหกกติกา' },
];

/** Render text ที่มี *...* เป็นตัวเน้น (เก็บข้อความกติกาไว้ตรงตามต้นฉบับ) */
function emphasize(text) {
  return text.split(/(\*[^*]+\*)/g).map((part, i) =>
    part.startsWith('*') && part.endsWith('*') && part.length > 2
      ? <strong key={i} style={{ color: 'var(--accent-strong)' }}>{part.slice(1, -1)}</strong>
      : part
  );
}

function getCurrentSession() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return SESSIONS.find(s => mins >= s.startMin && mins < s.endMin);
}

function timeToNextSession() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const next = SESSIONS.find(s => s.startMin > mins);
  if (!next) return null;
  const diff = next.startMin - mins;
  return { session: next, hrs: Math.floor(diff / 60), mins: diff % 60 };
}

// ════════════════════════════════════════════════════════════════════════════
//  Main TradingPlaybook — HA-50
// ════════════════════════════════════════════════════════════════════════════
export function TradingPlaybook({ tradesToday = 0, lossesInRow = 0 }) {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('atelier:trading:playbook-collapsed') === '1'
  );
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    localStorage.setItem('atelier:trading:playbook-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  const current = getCurrentSession();
  const next    = timeToNextSession();
  const today = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'long' });
  const time  = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  // กติกาเหล็ก: แพ้ 3 ไม้ในวันเดียว = ปิดจอ
  const blockedByLossStreak = lossesInRow >= MAX_LOSSES_PER_DAY;

  return (
    <Card>
      <CardHeader
        eyebrow={`🎯 HA-50 PLAYBOOK · ${today} · ${time}`}
        title="วันนี้เทรดได้ไหม เข้าเงื่อนไขไหม"
        meta={
          <span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              XAUUSD · TF 1h · EMA50 + Heikin Ashi · เสี่ยง 1% ต่อไม้
            </span>
          </span>
        }
        action={<Button variant="ghost" size="sm" onClick={() => setCollapsed(c => !c)}>
          {collapsed ? '▾ ขยาย' : '▴ ย่อ'}
        </Button>}
      />

      {/* Current status bar — always visible */}
      <div style={{
        padding: '12px 14px', borderRadius: 'var(--radius-control)',
        background: blockedByLossStreak
          ? 'var(--danger-soft)'
          : current ? 'var(--success-soft)' : 'var(--background-soft)',
        border: '1px solid ' + (blockedByLossStreak
          ? 'var(--danger)'
          : current ? 'var(--success)' : 'var(--border)'),
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {current ? (
            <>
              <Badge tone="success" size="lg">{current.label} เปิดอยู่</Badge>
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{current.setup}</span>
            </>
          ) : next ? (
            <>
              <Badge tone="neutral" size="lg">นอกเวลาเทรด</Badge>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {next.session.label} เปิดในอีก {next.hrs} ชม. {next.mins} นาที
              </span>
            </>
          ) : (
            <>
              <Badge tone="neutral" size="lg">ปิดจอวันนี้แล้ว</Badge>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>พรุ่งนี้เริ่ม 14:00 ตามเวลาไทย</span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Badge tone={tradesToday > 0 ? 'accent' : 'neutral'} size="sm">
            วันนี้ {tradesToday} ไม้
          </Badge>
          {lossesInRow > 0 && (
            <Badge tone={lossesInRow >= MAX_LOSSES_PER_DAY ? 'danger' : 'warning'} size="sm">
              ขาดทุน {lossesInRow} ติด
            </Badge>
          )}
        </div>
      </div>

      {/* Block warning */}
      {blockedByLossStreak && (
        <div style={{
          marginTop: 10, padding: '10px 14px',
          background: 'var(--danger-soft)', color: 'var(--danger)',
          border: '1px solid var(--danger)', borderRadius: 'var(--radius-control)',
          fontSize: 13,
        }}>
          🛑 <strong>แพ้ {lossesInRow} ไม้ติด</strong> — ปิดจอทันที ห้ามแก้มือ · กลับมาพรุ่งนี้
        </div>
      )}

      {!collapsed && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Session window */}
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.16em', marginBottom: 8 }}>
              ⏰ หน้าต่างเทรด · UTC+7
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {SESSIONS.map(s => {
                const isNow = current?.id === s.id;
                return (
                  <div key={s.id} style={{
                    padding: '12px 14px', background: 'var(--background-soft)',
                    border: '1px solid ' + (isNow ? s.color : 'var(--border)'),
                    borderRadius: 'var(--radius-control)',
                    boxShadow: isNow ? `0 0 0 1px ${s.color}` : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontFamily: 'var(--f-display)', fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {s.label}
                      </span>
                      {isNow && <Badge tone="success" size="sm">ตอนนี้</Badge>}
                    </div>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: s.color, marginBottom: 6, fontWeight: 500 }}>
                      {s.start}–{s.end}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {s.setup}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pre-Trade Checklist */}
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.16em', marginBottom: 8 }}>
              ✅ PRE-TRADE CHECKLIST · ตอบ "ใช่" ครบ 7 ข้อก่อนเข้า
            </div>
            <Card variant="paper" padding={14}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CHECKLIST.map((item, i) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--paper-ink)', lineHeight: 1.6 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'var(--accent-soft)', color: 'var(--accent-strong)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 600,
                      flexShrink: 0,
                    }}>{i + 1}</span>
                    <span>{emphasize(item.text)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Rules */}
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.16em', marginBottom: 8 }}>
              📜 กฎเหล็ก
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
              {RULES.map((r, i) => (
                <div key={i} style={{
                  padding: '10px 12px',
                  background: r.tone === 'success' ? 'var(--success-soft)' : 'var(--danger-soft)',
                  border: '1px solid ' + (r.tone === 'success' ? 'var(--success)' : 'var(--danger)'),
                  borderRadius: 'var(--radius-control)',
                  display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12,
                  color: r.tone === 'success' ? 'var(--success)' : 'var(--danger)',
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{r.icon}</span>
                  <span style={{ color: 'var(--text-primary)', lineHeight: 1.6 }}>{r.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quote */}
          <div style={{
            padding: '14px 18px', background: 'var(--background-soft)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: 'var(--radius-control)',
            fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 14,
            color: 'var(--text-secondary)', lineHeight: 1.6,
          }}>
            "ภารกิจนี้ไม่ได้วัดว่าได้เงินเท่าไร — วัดว่า <strong style={{ color: 'var(--accent-strong)' }}>ทำตามกติกาได้ครบ 30 ไม้ไหม</strong> · expectancy ~0"
          </div>
        </div>
      )}
    </Card>
  );
}

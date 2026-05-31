import { useState, useEffect } from 'react';
import { Card, CardHeader, Badge, Button } from '../ui/index.js';

// ─── Session schedule (UTC+7) ───────────────────────────────────────────────
const SESSIONS = [
  {
    id: 'London',
    label: '🇬🇧 London KZ',
    start: '14:00', end: '17:00',
    startMin: 14*60, endMin: 17*60,
    setup: 'Judas Swing — sweep Asia High แล้ว reverse SHORT',
    color: 'var(--blue)',
  },
  {
    id: 'NY',
    label: '🇺🇸 NY KZ',
    start: '19:00', end: '22:00',
    startMin: 19*60, endMin: 22*60,
    setup: 'Asia Low Sweep + Reclaim → LONG (หรือ High → SHORT)',
    color: 'var(--accent-strong)',
  },
  {
    id: 'Silver',
    label: '⚡ Silver Bullet',
    start: '22:00', end: '23:00',
    startMin: 22*60, endMin: 23*60,
    setup: 'Quick scalp setup เหมือน NY แต่ TF เล็กลง',
    color: 'var(--violet)',
  },
];

const CHECKLIST = [
  { id: 'asia',    text: 'Asia ปิดสมบูรณ์แล้ว (หลัง 14:00)' },
  { id: 'mtf',     text: 'H1 + M15 align กับ FVG zone (ไม่ใช่ M5 เดียว)' },
  { id: 'confirm', text: 'รอ Sweep เกิดแล้ว + structure confirm (ไม่ใช่ Limit anticipation)' },
  { id: 'daily',   text: 'Daily candle ไม่ขัดกับ direction' },
  { id: 'first',   text: 'ไม่ใช่ trade ที่ 2 ของวัน (ขาดทุนแล้ว = หยุด)' },
];

const RULES = [
  { tone: 'success', icon: '✅', text: 'Setup เดียว: Asia Sweep + Reclaim + FVG ที่ EDGE ของ M15+ TF' },
  { tone: 'success', icon: '✅', text: 'Confirmation Entry — รอ M5 BOS/ChoCH ก่อน entry' },
  { tone: 'success', icon: '✅', text: 'Max 1 trade ต่อ session · 2 trade ต่อวัน' },
  { tone: 'danger',  icon: '🛑', text: 'ห้าม Pre-Session (Pre-London, Pre-NY) — 0% WR' },
  { tone: 'danger',  icon: '🛑', text: 'ห้าม Anticipation Limit กลาง FVG zone' },
  { tone: 'danger',  icon: '🛑', text: 'ห้าม Pending order ข้ามคืน' },
  { tone: 'danger',  icon: '🛑', text: 'ขาดทุน 1 ครั้ง = หยุดทั้งวัน' },
  { tone: 'danger',  icon: '🛑', text: 'ขาดทุน 3 ครั้งติด = พัก 7 วัน' },
];

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
//  Main TradingPlaybook
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
  const next = timeToNextSession();
  const today = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'long' });
  const time  = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  // Trading allowed status
  const blockedByLossStreak = lossesInRow >= 3;
  const blockedByDailyLimit = tradesToday >= 2;
  const blockedByOneLossDay = false; // placeholder — track if any loss today

  return (
    <Card>
      <CardHeader
        eyebrow={`🎯 TRADING PLAYBOOK · ${today} · ${time}`}
        title="วันนี้เทรดอะไรได้บ้าง"
        action={<Button variant="ghost" size="sm" onClick={() => setCollapsed(c => !c)}>
          {collapsed ? '▾ ขยาย' : '▴ ย่อ'}
        </Button>}
      />

      {/* Current status bar — always visible */}
      <div style={{
        padding: '12px 14px', borderRadius: 'var(--radius-control)',
        background: current
          ? 'var(--success-soft)'
          : blockedByLossStreak || blockedByDailyLimit
            ? 'var(--danger-soft)'
            : 'var(--background-soft)',
        border: '1px solid ' + (current
          ? 'var(--success)'
          : blockedByLossStreak || blockedByDailyLimit
            ? 'var(--danger)'
            : 'var(--border)'),
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
              <Badge tone="neutral" size="lg">ไม่ใช่ killzone</Badge>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {next.session.label} เปิดในอีก {next.hrs} ชม. {next.mins} นาที
              </span>
            </>
          ) : (
            <>
              <Badge tone="neutral" size="lg">หมด session วันนี้</Badge>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>พรุ่งนี้ London เปิด 14:00</span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Badge tone={tradesToday >= 2 ? 'danger' : tradesToday >= 1 ? 'warning' : 'neutral'} size="sm">
            วันนี้ {tradesToday}/2 trade
          </Badge>
          {lossesInRow > 0 && (
            <Badge tone={lossesInRow >= 3 ? 'danger' : 'warning'} size="sm">
              ขาดทุน {lossesInRow} ติด
            </Badge>
          )}
        </div>
      </div>

      {/* Block warnings */}
      {blockedByLossStreak && (
        <div style={{
          marginTop: 10, padding: '10px 14px',
          background: 'var(--danger-soft)', color: 'var(--danger)',
          border: '1px solid var(--danger)', borderRadius: 'var(--radius-control)',
          fontSize: 13,
        }}>
          🛑 <strong>ขาดทุน 3 ครั้งติด</strong> — ห้ามเทรด 7 วัน · พักให้เคลียร์หัวก่อน
        </div>
      )}
      {!blockedByLossStreak && blockedByDailyLimit && (
        <div style={{
          marginTop: 10, padding: '10px 14px',
          background: 'var(--warning-soft)', color: 'var(--accent-strong)',
          border: '1px solid var(--warning)', borderRadius: 'var(--radius-control)',
          fontSize: 13,
        }}>
          ⚠️ ครบ 2 trades วันนี้แล้ว — หยุดเพื่อรักษา process · กลับมาพรุ่งนี้
        </div>
      )}

      {!collapsed && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Daily Schedule */}
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.16em', marginBottom: 8 }}>
              ⏰ DAILY SCHEDULE · UTC+7
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
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
              ✅ PRE-TRADE CHECKLIST · ต้อง tick ครบ 5 ข้อก่อน entry
            </div>
            <Card variant="paper" padding={14}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CHECKLIST.map((item, i) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--paper-ink)' }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'var(--accent-soft)', color: 'var(--accent-strong)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 600,
                      flexShrink: 0,
                    }}>{i + 1}</span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Rules */}
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.16em', marginBottom: 8 }}>
              📜 HARD RULES
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
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
                  <span style={{ color: 'var(--text-primary)' }}>{r.text}</span>
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
            "ไม่ได้เหลือ session ไหน — เหลือ <strong style={{ color: 'var(--accent-strong)' }}>1 setup ที่ work</strong> ที่ใช้ได้ใน 3 killzones · ลด trade ลง = กำไรเพิ่ม"
          </div>
        </div>
      )}
    </Card>
  );
}

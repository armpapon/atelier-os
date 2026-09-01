import { useState, useEffect } from 'react';
import { Card, CardHeader, Badge, Button } from '../ui/index.js';
import { Icon } from '../Icon.jsx';

// ─── A3 — บอทเทรดตลอดเวลาตลาดเปิด ไม่มีหน้าต่างเวลา (วิจัยไม่มี session filter) ───
// ระบบเดียว: XAUUSD · TF 1h · MACD(12,26,9) ตัด signal + EMA200 · SL 1.5×ATR14
const SESSIONS = [
  {
    id: 'A3', label: 'Bot 24/5',
    start: '00:00', end: '24:00',
    startMin: 0, endMin: 24 * 60,
    setup: 'MACD ตัด signal + close เทียบ EMA200 → บอทเข้าที่ open แท่งถัดไป · ออกเมื่อตัดกลับ · SL 1.5×ATR14',
    color: 'var(--accent-strong)',
  },
];

const MAX_LOSSES_PER_DAY = 3;

const CHECKLIST = [
  { id: 'running', text: 'บอท GoldMacdTrendBot สถานะ *Running* และ instance เดียวเท่านั้น' },
  { id: 'sl',      text: 'ไม้ที่เปิดอยู่มี SL ติดบน server ทุกไม้ (บอทปิดเองถ้าตั้งไม่สำเร็จ)' },
  { id: 'log',     text: 'ไม้ที่ปิดแล้ววันนี้ *จดครบภายในวันเดียวกัน* — แคป History ส่งให้ Claude ลงระบบ' },
  { id: 'reject',  text: 'เช็ค Log ว่าไม่มี REJECT ผิดปกติ (volume below minimum = ทุนไม่พอ ห้ามแก้ด้วยการเพิ่ม risk)' },
  { id: 'hands',   text: '*ไม่ได้แตะ* parameter หรือปิดไม้แทนบอทเลยตลอดวัน' },
];

const RULES = [
  { tone: 'danger',  icon: 'ban' , text: 'ห้ามปิดไม้แทนบอท ห้ามเลื่อน SL — WR ระบบคือ 36% แพ้ติดกันหลายไม้คือเรื่องปกติของระบบนี้' },
  { tone: 'danger',  icon: 'ban' , text: 'ห้ามแก้ parameter กลางการทดสอบ — เปลี่ยนเมื่อไหร่ ไม้ที่นับมานับใหม่ทั้งหมด' },
  { tone: 'danger',  icon: 'ban' , text: 'ห้ามเพิ่ม Risk % เพราะอยากทวงทุนคืน — ถ้าบอท REJECT เพราะทุนไม่พอ ทางแก้เดียวคือเติมทุน ไม่ใช่เพิ่มเสี่ยง' },
  { tone: 'success', icon: 'check', text: 'จดทุกไม้ภายในวันเดียวกัน ห้ามค้าง — ไม้ที่ไม่ได้จด = แหกกติกา' },
  { tone: 'success', icon: 'check', text: 'แพ้ต่อเนื่องผิดปกติ (เกิน 6 ไม้ติด) = แคป Log มาคุยกับ Claude ก่อน ไม่ใช่ปิดบอทเอง' },
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
//  Main TradingPlaybook — A3
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
        eyebrow={`A3 Playbook · ${today} · ${time}`}
        title="วันนี้เทรดได้ไหม เข้าเงื่อนไขไหม"
        meta={
          <span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              XAUUSD · TF 1h · MACD(12,26,9) + EMA200 · GoldMacdTrendBot
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
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>พรุ่งนี้เริ่ม 08:00 ตามเวลาไทย</span>
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
          <Icon name="ban" size={14} /> <strong>แพ้ {lossesInRow} ไม้ติด</strong> — ปิดจอทันที ห้ามแก้มือ · กลับมาพรุ่งนี้
        </div>
      )}

      {!collapsed && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Session window */}
          <div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              <Icon name="clock" size={13} /> หน้าต่างเทรด · UTC+7
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
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              <Icon name="check" size={13} /> เช็กลิสต์ก่อนเข้าไม้ · ตอบ "ใช่" ครบ 7 ข้อก่อนเข้า
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
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              <Icon name="history" size={13} /> กฎเหล็ก
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
                  <span style={{ flexShrink: 0 }}><Icon name={r.icon} size={14} /></span>
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

import { Card, CardHeader, Badge, Button } from './ui/index.js';
import { LoopMark } from './LoopMark.jsx';

export const CHANGELOG = [
  {
    version: 'v0.8',
    date: '2026-05-30',
    title: 'Family Photos · รูปสมาชิกครอบครัว',
    badge: 'Current',
    changes: [
      '📸 อัปโหลดรูปภาพสมาชิกครอบครัวได้ — ใช้ Supabase Storage (bucket "avatars")',
      'Client-side resize เป็น square 480×480 ก่อนอัปโหลด (ไฟล์ < 300KB)',
      'Avatar component — แสดงรูปถ้ามี, ถ้าไม่มีก็ fallback เป็นวงกลมสี + อักษรย่อ',
      'Edit mode สำหรับสมาชิก — กดปุ่ม ✎ บนการ์ดเพื่อแก้ข้อมูล/รูป',
      'Hover avatar = "เปลี่ยนรูป" overlay; ปุ่ม × ลบรูปได้',
    ],
  },
  {
    version: 'v0.7',
    date: '2026-05-30',
    title: 'Debt Tracker · Auto-link + Interest + Snowball/Avalanche',
    changes: [
      '🔗 Auto-link: ตอน import CSV ระบบ match transactions กับหนี้สินอัตโนมัติ (โดยจำนวน + ชื่อผู้รับ)',
      '📊 Interest math: คำนวณเงินต้น + ดอกเบี้ยรวม + ดอกเบี้ยที่เหลือ จาก rate + งวด',
      '⚡ Strategy: Snowball (โปะก้อนเล็กก่อน) vs Avalanche (ดอกเบี้ยสูงก่อน) — slider ปรับเงินโปะเพิ่ม → เห็นว่าปลอดหนี้เร็วขึ้นกี่เดือน + ประหยัดเท่าไหร่',
      'ลำดับการปลอดหนี้แสดงเป็นรายการพร้อม badge เร็วขึ้น',
      'Field ใหม่ใน DebtForm: ดอกเบี้ย/ปี + เงินต้น (optional)',
    ],
  },
  {
    version: 'v0.6',
    date: '2026-05-30',
    title: 'Debt Tracker · จ่ายแล้ว/ยัง + Forecast',
    changes: [
      'เพิ่ม Debt Tracker บนหน้าการเงิน — list หนี้สินที่ผ่อนรายเดือน',
      'สถานะแต่ละหนี้: จ่ายแล้ว / รอจ่าย / เกินกำหนด พร้อม Badge สี',
      'ปุ่ม "บันทึกว่าจ่ายแล้ว" — track ทีละเดือนได้',
      'Progress bar งวด X / N + เหลือกี่เดือนถึงปลอดหนี้',
      'Forecast 12 เดือน — แสดงภาระต่อเดือนลดลงเมื่อหนี้แต่ละก้อนผ่อนหมด',
      'Summary stats: จ่ายแล้ว · รอจ่าย · เกินกำหนด · คงเหลือรวม',
    ],
  },
  {
    version: 'v0.5',
    date: '2026-05-30',
    title: 'Rebrand → Loop · Editorial Minimal OS',
    changes: [
      'Rebrand จาก Atelier OS → Loop · มีโลโก้ใหม่เป็นวงกลม loop/cycle',
      'Design tokens — warm ivory palette, darker text, premium card surfaces',
      'Shared UI: Button (5 variants), Card, Badge, EmptyState',
      'Preview banner ปรับเป็น sticky status bar สุภาพ',
      'Sidebar active state เด่นขึ้น พร้อม left bar indicator',
      'Version History timeline เปิดจาก sidebar',
    ],
  },
  {
    version: 'v0.4',
    date: '2026-05-29',
    title: 'Life OS Dashboard + Accounts auto-create',
    changes: [
      'Dashboard ใหม่: Manifest, Themes, Goals, Today\'s Focus, Roadmap, Life Pulse',
      'CSV importer สร้างบัญชี (Cloud Pockets) อัตโนมัติพร้อม latest balance',
      'Dedup ตอน re-import + ปุ่ม "ล้างเดือนนี้" สำหรับ clean reset',
      'Personal/Family scope แยกอัตโนมัติจากชื่อกระเป๋า',
    ],
  },
  {
    version: 'v0.3',
    date: '2026-05-28',
    title: 'Finance as Financial Planner',
    changes: [
      'Cash Flow chart 12 เดือนพร้อม Savings Rate trend',
      'Category breakdown + Top 10 รายจ่าย + Budget vs Actual',
      'Net Worth tracker + Daily Spending Heatmap',
      'Month navigator + เปลี่ยนเดือนได้ทุก scope',
    ],
  },
  {
    version: 'v0.2',
    date: '2026-05-27',
    title: 'Make by KBank Integration',
    changes: [
      'รองรับ CSV Cloud Pocket format + PDF Statement (with password)',
      'Auto-categorize Thai merchants → 10+ หมวด',
      'แยก personal vs family scope จากชื่อกระเป๋า',
    ],
  },
  {
    version: 'v0.1',
    date: '2026-05-25',
    title: 'First release',
    changes: [
      'แดชบอร์ด · Daily Journal · Trading · Learning · Finance · Family',
      'Supabase backend + Auth + RLS',
      'Sukhumvit Set Thai font',
    ],
  },
];

export function VersionHistory({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(40,30,15,0.45)' }} />
      <div style={{
        position: 'relative', width: '90vw', maxWidth: 620, maxHeight: '85vh',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 26px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.18em', marginBottom: 4 }}>
              ✦ VERSION HISTORY
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, color: 'var(--text-primary)' }}>
              Loop · Changelog
            </div>
          </div>
          <button onClick={onClose} aria-label="ปิด" style={{
            background: 'transparent', border: 0, color: 'var(--text-muted)',
            fontSize: 22, cursor: 'pointer', padding: '0 4px',
          }}>×</button>
        </div>

        {/* Timeline */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 26px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {CHANGELOG.map((entry, idx) => (
              <div key={entry.version}>
                <Card variant={idx === 0 ? 'paper' : 'flat'} padding={18}>
                  <CardHeader
                    eyebrow={entry.version + ' · ' + entry.date}
                    title={entry.title}
                    action={entry.badge ? <Badge tone="accent" size="sm">{entry.badge}</Badge> : null}
                  />
                  <ul style={{
                    margin: 0, padding: '0 0 0 18px',
                    fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.85,
                  }}>
                    {entry.changes.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </Card>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 26px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
          fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
            <LoopMark size={14} /> Loop
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>ปิด</Button>
        </div>
      </div>
    </div>
  );
}

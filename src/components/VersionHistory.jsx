import { Card, CardHeader, Badge, Button } from './ui/index.js';
import { LoopMark } from './LoopMark.jsx';

export const CHANGELOG = [
  {
    version: 'v0.15',
    date: '2026-05-31',
    title: 'Revert · Skip Move Money + ลบ CashboxCard',
    badge: 'Current',
    changes: [
      '🔙 กลับไป behavior เดิม — Parser skip Move Money ทั้งหมด (เหมือนก่อน v0.13)',
      'ไม่มี "แบ่งงบไปครอบครัว" / "รับเงินจากกองกลาง" auto-generated อีกแล้ว',
      'ลบ CashboxCard ออกจากหน้า Finance — user จะ track allocation เอง',
      'แก้ปัญหา "งบ พ.ค. รวน" จาก allocation transactions ที่บวก/ลบ stats ผิด',
    ],
  },
  {
    version: 'v0.14',
    date: '2026-05-31',
    title: 'Finance · Recurring + Forecast + Emergency Fund',
    changes: [
      '📅 Recurring Tracker — list บิลประจำ + auto-detect จากประวัติ transactions (เจอตัวที่ซ้ำใน ≥2 เดือน + amount นิ่ง)',
      'Status เดือนนี้: จ่ายแล้ว / รอจ่าย / เกินกำหนด — match กับ transaction title + amount auto',
      '🔮 Cash Flow Forecast 3 เดือนข้างหน้า — รายรับเฉลี่ย − recurring − ผ่อนหนี้ − ใช้ทั่วไป',
      'แสดงตาราง 3 เดือนพร้อม net + cumulative · warning ถ้าจะติดลบ',
      'Auto-compute "active debts" — หนี้ที่ผ่อนหมดในเดือนถัดไปไม่นับใน forecast',
      '🛡 Emergency Fund Gauge — conic-gradient ring 0-6 เดือน · safe/warning/critical tiers',
      'Toggle "ใช้บัญชีนี้เป็นกองทุนฉุกเฉิน" ในการ์ด · auto-compute coverage = balance/avg expense',
      'แสดง "ขาดอีก X เพื่อ 6 เดือน coverage"',
      'Schema: recurring_expenses table + accounts.is_emergency_fund column',
    ],
  },
  {
    version: 'v0.13',
    date: '2026-05-31',
    title: 'Finance · Cashbox Flow + Import เหลือที่เดียว',
    changes: [
      '💰 CashboxCard ใหม่บนหน้าการเงินส่วนตัว — แสดง "เงินเข้า / แบ่งไปครอบครัว / ใช้ตรงจาก Cashbox / คงเหลือ"',
      '🔁 Parser track Move Money เฉพาะ Cashbox ↔ Family pocket (เคสจริงที่ user ทำทุกเดือน)',
      'Family scope จะเห็น "+80,000 รับเงินจากกองกลาง" เป็น income แล้ว · Personal เห็น "-80,000 แบ่งงบไปครอบครัว"',
      'Skip "แอบออมอัตโนมัติ" + Move Money อื่น ๆ (internal personal moves) เหมือนเดิม',
      '🗑 ลบปุ่ม Import จากหน้าครอบครัว — เหลือที่เดียวที่ส่วนตัว · auto-split ทั้ง 2 scope',
      'Family page hint: "Import ที่หน้าการเงินส่วนตัว ระบบจะ auto-split scope"',
      'ป้ายเตือนเมื่อมีเงินค้าง Cashbox > 10% ของรายรับ → suggest โอนเข้ากองทุน',
    ],
  },
  {
    version: 'v0.12',
    date: '2026-05-31',
    title: 'Learning · Study Sessions + Timer + Understanding Score',
    changes: [
      '⏱ Reading Timer — stopwatch จับเวลาตอนอ่าน/ดู หยุดได้ ดึงเวลามาบันทึก auto',
      '📖 Book tracking: ใส่จำนวนหน้าทั้งหมด, หน้าเริ่ม → หน้าจบ → auto-compute pages_read',
      '🔁 บันทึก reading_count — กดปุ่ม "อ่านจบรอบที่ N" รีเซ็ต current_page',
      '⭐ Understanding Score 1-5 ต่อ session — งง/ยังไม่ค่อย/พอเข้าใจ/เข้าใจดี/แม่นมาก',
      '✨ Summary + Notes ต่อ session — บันทึก key takeaway ทุกครั้ง',
      '💡 Smart Hints — ระบบแนะนำตาม pattern: ดูซ้ำถ้าคะแนนต่ำ, สรุปด้วยคำตัวเองถ้าซ้ำหน้าเดิม 3 ครั้ง, พักสายตาถ้าต่อเนื่อง 60+ นาที, teach back ถ้าเข้าใจสูง',
      '📜 Sessions timeline — ดูประวัติทั้งหมดต่อ source พร้อม ★ rating',
      '📊 Stats tab — sessions/เวลารวม/หน้ารวม/avg score/หน้าต่อชม./reading count',
      'Auto-update progress: % จาก current_page/total_pages หรือ video position/duration',
    ],
  },
  {
    version: 'v0.11',
    date: '2026-05-31',
    title: 'Trading Playbook + ICT Learning Curriculum',
    changes: [
      '🎯 Trading Playbook card บนหน้า Trading — แสดง session ปัจจุบัน/ถัดไป + countdown',
      'Daily Schedule 3 killzones (London/NY/Silver Bullet) พร้อม setup target',
      'Pre-Trade Checklist 5 ข้อ ที่ต้อง tick ก่อน entry',
      '📜 Hard Rules — ทั้ง KEEP (4 ข้อ) และ STOP (4 ข้อ)',
      'Auto-detect: ขาดทุน 3 ติด → block 7 วัน · ครบ 2 trade/วัน → warn',
      '📚 Seed Learning Hub 14 sources เน้น gap จริง — MTF, Confirmation Entry, Judas Swing, Trade Mgmt, Psychology, Position Sizing',
      'หนังสือ Trading In The Zone + The Disciplined Trader + Best Loser Wins',
    ],
  },
  {
    version: 'v0.10',
    date: '2026-05-30',
    title: 'Trading Journal · Adapt ICT Excel Workflow',
    changes: [
      '📊 Excel Importer — รับ Trading-Journal-2026.xlsx ทั้งไฟล์ (sheet "Trade Log")',
      'Auto-map columns ไทย/อังกฤษ + parse DD/MM/YYYY → ISO, Win/Loss/BE → status',
      'Dedup ด้วย (วันที่+symbol+entry+pnl) ไม่ duplicate ตอน re-import',
      'Trading page rewrite ใช้ shared UI: 5 KPI cards, Equity Chart, Performance card, Filter pills',
      'Trade Detail Drawer — คลิกแถวเปิด: Setup Detail + Emotion + 🌟 Lesson Learned',
      'Trade Log table แสดง: วันที่/symbol/dir/setup+session/RR/P&L+status badge/balance',
      'Equity Chart SVG พร้อม gradient fill + dot สีตาม win/loss',
      'TradeForm รองรับ fields ใหม่ครบ: entry/sl/tp/lot/balance/pnl_pct/setup_detail/lesson_learned',
    ],
  },
  {
    version: 'v0.9',
    date: '2026-05-30',
    title: 'Family · Health Profile + Growth Log + Milestones',
    changes: [
      '🏥 Health Profile per สมาชิก — เลือดกรุ๊ป, แพ้ยา, โรคประจำตัว, หมอประจำ, ประกัน',
      '💉 Vaccinations log — บันทึกประวัติวัคซีน + เข็มถัดไปครบกำหนดเมื่อไหร่',
      '📏 Growth Log — บันทึกส่วนสูง/น้ำหนัก/รอบหัว + กราฟ trend SVG (dual-axis)',
      '🌟 Milestones — timeline ความทรงจำสำคัญ (เดินครั้งแรก, รางวัล, โรงเรียนใหม่) แบ่งตามปี',
      'คลิก member row = เปิด detail drawer แบบ slide-in (4 tabs)',
      'ปุ่ม ✎ บนการ์ดเปิด quick edit modal เหมือนเดิม',
    ],
  },
  {
    version: 'v0.8',
    date: '2026-05-30',
    title: 'Family Photos · รูปสมาชิกครอบครัว',
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

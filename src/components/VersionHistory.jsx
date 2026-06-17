import { Card, CardHeader, Badge, Button } from './ui/index.js';
import { LoopMark } from './LoopMark.jsx';

export const CHANGELOG = [
  {
    version: 'v2.2',
    date: '2026-06-16',
    title: 'Second Brain · ปักหมุดเด้งขึ้นบนทันที + แยกหมวดให้ชัด',
    badge: 'Current',
    changes: [
      '📌 FIX: ปักหมุดแล้วโน้ตเด้งขึ้นบนสุดทันที (เดิมต้องรีโหลดก่อน)',
      '🗂️ แยกรายการเป็น "ปักหมุด" กับ "ล่าสุด" — พอโน้ตเยอะจะหาง่ายขึ้น',
    ],
  },
  {
    version: 'v2.1',
    date: '2026-06-16',
    title: 'Life Calendar · มาร์กเหตุการณ์สำคัญลงบนกริดชีวิต',
    changes: [
      '🌹 เพิ่ม "เหตุการณ์สำคัญ" — มาร์กช่วงในอดีต (เรียนจบ แต่งงาน) และอนาคต (เป้าหมายที่อยากไปถึง) ลงบนกริด',
      'แต่ละเหตุการณ์เลือก emoji + วันที่ → ช่องบนกริดเปลี่ยนเป็นสีกุหลาบ ชี้เมาส์เห็นชื่อ',
      'รายการด้านล่างเรียงตามเวลา บอกอายุตอนนั้น + อีกกี่ปีจะถึง',
    ],
  },
  {
    version: 'v2.0',
    date: '2026-06-16',
    title: 'Life Calendar · เห็นทั้งชีวิตเป็นกริด เตือนใจว่าเวลามีค่า',
    changes: [
      '⏳ หน้าใหม่ "Life Calendar" (กลุ่มชีวิต) — แบบ Your Life in Weeks',
      'ตั้งวันเกิด + อายุคาดหวัง → วาดชีวิตทั้งหมดเป็นกริด · สลับดูแบบ สัปดาห์ / เดือน / ปี',
      'สถิติ: อายุ, ผ่านมากี่ %, เหลืออีกกี่ปี/สัปดาห์ + แถบความคืบหน้า + คำเตือนใจ',
      '(เก็บค่าใน localStorage — ไม่ต้องรัน SQL)',
    ],
  },
  {
    version: 'v1.9',
    date: '2026-06-16',
    title: 'Journal · "นัดที่จะถึง" มองไปข้างหน้า 14 วัน',
    changes: [
      '📅 ขยายช่วง "นัดที่จะถึง" จาก 7 → 14 วัน — นัดสัปดาห์หน้าไม่ตกหล่น',
      '(เกณฑ์เดิม: ต้องเป็นประเภท "เหตุการณ์" + ใส่เวลาด้วยถึงจะขึ้น)',
    ],
  },
  {
    version: 'v1.8',
    date: '2026-06-16',
    title: 'Journal · ปฏิทินจิ๋วใน sidebar เห็นภาพรวมทั้งเดือน',
    changes: [
      '🗓️ ปฏิทินเดือนใน sidebar ของ Daily Journal — วันไหนมีรายการจะมีจุด, วันที่มีนัดจุดสีเข้ม',
      'คลิกวันไหนก็กระโดดไปวันนั้นได้ · เลื่อนดูเดือนก่อน/ถัดไปด้วย ‹ ›',
      'ปฏิทินเลื่อนตามอัตโนมัติเมื่อเปลี่ยนวันข้ามเดือน',
    ],
  },
  {
    version: 'v1.7',
    date: '2026-06-16',
    title: 'Second Brain · พิมพ์ [[ ]] ไม่เจอโน้ต ก็มีปุ่ม "สร้างใหม่" ให้เลย',
    changes: [
      '➕ ถ้าพิมพ์ใน [[...]] แล้วยังไม่มีโน้ตชื่อนั้น ระบบขึ้นตัวเลือก "สร้างลิงก์" ให้ — dropdown ไม่เงียบอีกต่อไป',
      'หมายเหตุ: autocomplete ค้นจาก "ชื่อโน้ต" เท่านั้น (ไม่ใช่แท็ก) — อยากลิงก์หัวข้อไหนให้สร้างเป็นโน้ตก่อน',
    ],
  },
  {
    version: 'v1.6',
    date: '2026-06-16',
    title: 'Second Brain · พิมพ์ [[ ]] แล้วเลือกโน้ตจากรายการได้เลย',
    changes: [
      '🔎 พิมพ์ใน [[...]] แล้วระบบขึ้นรายการโน้ตที่ใกล้เคียงให้เลือก — พิมพ์ "F" ก็เจอ "Facebook Ads"',
      'เลือกด้วยเมาส์ หรือลูกศร ↑↓ + Enter ได้ · กันลิงก์หลุดเพราะสะกดต่างกัน',
      'กดปุ่ม "แทรกลิงก์" แล้วรายการเด้งขึ้นทันที',
    ],
  },
  {
    version: 'v1.5',
    date: '2026-06-16',
    title: 'Second Brain · เทมเพลตโน้ตสำเร็จรูป',
    changes: [
      '📑 กด "โน้ตใหม่" แล้วเลือกเทมเพลตได้ทันที — โน้ตเปล่า, บัญชีส่วนตัว, ออกกำลังกาย, นั่งสมาธิ, บันทึกประชุม, ไอเดีย, สรุปหนังสือ, เป้าหมายสัปดาห์',
      'เทมเพลตเติมวันที่/เดือนปัจจุบันให้อัตโนมัติ + ติดแท็กให้พร้อม',
    ],
  },
  {
    version: 'v1.4',
    date: '2026-06-15',
    title: 'Second Brain · คลังโน้ตเชื่อมโยงกันแบบ Zettelkasten',
    changes: [
      '✦ เปิดใช้งานหน้า Second Brain เต็มรูปแบบ (แทนหน้า "เร็วๆ นี้")',
      '🔗 ลิงก์โน้ตถึงกันด้วย [[ชื่อโน้ต]] — คลิกเปิด หรือสร้างโน้ตใหม่ได้ทันทีถ้ายังไม่มี',
      '↩ Backlinks — แต่ละโน้ตเห็นว่า "ถูกอ้างถึงจาก" โน้ตไหนบ้าง',
      '🔍 ค้นหาทั้งชื่อ+เนื้อหา (รองรับภาษาไทย) + กรองด้วยแท็ก + ปักหมุดโน้ตสำคัญ',
      '💾 บันทึกอัตโนมัติเมื่อคลิกออกจากช่อง',
      '⚠️ ต้องรัน SQL: supabase/migration_add_notes.sql',
    ],
  },
  {
    version: 'v1.3',
    date: '2026-06-15',
    title: 'Journal · การ์ด "นัดที่จะถึง" สรุปนัด 7 วันข้างหน้า',
    changes: [
      '🗓️ การ์ดใหม่ในหน้า Journal — รวมรายการ "เหตุการณ์" ที่มีเวลาในช่วง 7 วันข้างหน้า',
      'กดที่นัดเพื่อกระโดดไปยังวันนั้นในหน้า Journal ทันที',
    ],
  },
  {
    version: 'v1.2',
    date: '2026-06-15',
    title: 'Journal · โน้ตละเอียด + นัด + เพิ่มลง Google Calendar',
    changes: [
      '📝 แต่ละรายการใน Journal เปิดดูรายละเอียด/โน้ตยาวๆ ได้ — กดไอคอน ▸ ข้างรายการ',
      '🕐 รายการประเภท "เหตุการณ์" ใส่เวลาเริ่ม/จบ + สถานที่ได้',
      '📅 ปุ่ม "เพิ่มลง Google Calendar" — เปิดหน้า Google Calendar แบบกรอกข้อมูลให้พร้อม (ไม่ต้อง login เชื่อมต่อ)',
      '⚠️ ต้องรัน SQL: supabase/migration_add_journal_details.sql',
    ],
  },
  {
    version: 'v1.1',
    date: '2026-06-08',
    title: 'Learning · ยกเครื่องระบบอ่านหนังสือเป็น Reading Companion',
    changes: [
      '🐛 FIX: กรอก session แล้วไม่อัพเดท — ถ้าหนังสือยังไม่ตั้งจำนวนหน้า ระบบจะถามก่อน + การ์ดเลิกค้าง "ยังไม่เริ่ม" ทันทีที่บันทึก session แรก',
      '💎 Insights Bank — เก็บ "ข้อคิด / Quote / สิ่งที่จะลงมือทำ" ถาวรต่อเล่ม · action item ติ๊กเสร็จได้',
      '🔥 Reading streak — นับวันอ่านต่อเนื่อง',
      '⚡ ความเร็วอ่าน (หน้า/ชม.) + 🏁 ประมาณว่าอีกกี่วันอ่านจบ — คำนวณอัตโนมัติ',
      'Progress Hero ใหม่ใต้หัว drawer: %, แถบหน้า, streak, เวลรวม, คะแนนเข้าใจเฉลี่ย',
      'Stats เพิ่ม streak / pages-per-day / action items done',
      '⚠️ ต้องรัน SQL: supabase/migration_add_learning_insights.sql',
    ],
  },
  {
    version: 'v1.0',
    date: '2026-06-05',
    title: '🎉 Loop — official rename milestone',
    changes: [
      'เปลี่ยนชื่อโปรเจคจาก "Atelier OS" → "Loop" อย่างเป็นทางการ',
      'Local folder rename: atelier-os/ → Loop/',
      'package.json name = "loop" · version = 1.0.0',
      'CLAUDE.md + README อัพเดทตามชื่อใหม่',
      '(GitHub repo + Vercel project ยังเป็น "atelier-os" — URL เดิม atelier-os-eta.vercel.app ใช้งานปกติ)',
    ],
  },
  {
    version: 'v0.30',
    date: '2026-06-05',
    title: 'Learning Hub · ใส่รูปปกหนังสือ/คอร์สได้แล้ว',
    changes: [
      '📚 อัพโหลดรูปปก (book cover / course thumbnail) สำหรับทุก source',
      'แทนตัวอักษร "TH" / "BL" placeholder ที่แสดงเดิม',
      'Auto resize 800px JPEG · เก็บใน Supabase Storage bucket "avatars"',
      'YouTube ยังใช้ thumbnail อัตโนมัติ (ถ้าไม่ได้อัพรูปปกเอง)',
      '⚠️ ต้องรัน SQL migration หนึ่งครั้ง: ALTER TABLE learning_sources ADD COLUMN cover_url text',
    ],
  },
  {
    version: 'v0.29',
    date: '2026-06-05',
    title: 'Finance · เปิดมาทีไรเป็นเดือนนี้เสมอ',
    changes: [
      '📅 หน้าการเงินเปิดมา default = เดือนปัจจุบัน เสมอ',
      'เดิม remember เดือนสุดท้ายที่ดู (localStorage) → เปิดมาเจอเดือนเก่า',
      'ยังเลื่อนไปดูเดือนอื่นใน session ได้ปกติ — แค่ไม่ค้าง',
    ],
  },
  {
    version: 'v0.28',
    date: '2026-06-04',
    title: 'Categories · เพิ่มหมวดเองได้แล้ว',
    changes: [
      '➕ Dropdown หมวดมี "+ เพิ่มหมวดใหม่..." ที่ปลายสุด',
      'เพิ่ม emoji + ชื่อ → save → ใช้งานได้ทันที (+ auto-set ให้ row ที่กด)',
      'TxnForm chip selector ก็มีปุ่ม "+ เพิ่มหมวด" เหมือนกัน',
      'Custom cats เก็บใน localStorage (loop:custom-categories) — ใช้ข้าม session',
      'Default 7 หมวดยังอยู่ + custom ที่คุณเพิ่มจะ merge เข้ามาในทุก dropdown',
      'พร้อมวิเคราะห์ร่วมกัน: หมวดเองจะอยู่ใน DB transactions แล้ว query ได้ปกติ',
    ],
  },
  {
    version: 'v0.27',
    date: '2026-06-04',
    title: 'Popup · Centered over the table',
    changes: [
      '🎯 Anchor ใช้ row จริง (closest data-txn-row) แทนปุ่ม ⋯',
      'Popup center → ทั้ง vertical และ horizontal ตรงกับ row จริง',
      'ไม่ทับ sidebar อีก — โผล่ตรงโซนตารางที่กด',
    ],
  },
  {
    version: 'v0.26',
    date: '2026-06-04',
    title: 'Popup · Center on click row',
    changes: [
      '🎯 Rule เดียว: popup center = row center (กดที่ไหน popup อยู่ตรงนั้น)',
      'กดบน → popup บน · กดกลาง → กลาง · กดล่าง → ล่าง',
      'Clamp ขอบจอเสมอ ไม่ทะลุออกนอก viewport',
      'Horizontal กลางจอเสมอ (อ่านง่าย)',
    ],
  },
  {
    version: 'v0.25',
    date: '2026-06-04',
    title: 'Popup · Zone-aligned positioning',
    changes: [
      'พยายามให้ popup top ติด row top — แต่ user ยังรู้สึกว่าอยู่กลาง',
      '(แทนที่ด้วย v0.26 — center on row แบบเรียบง่ายกว่า)',
    ],
  },
  {
    version: 'v0.24',
    date: '2026-06-04',
    title: 'TxnForm · Anchor-positioned popup',
    changes: [
      '📍 Edit popup โผล่ติดกับปุ่ม ⋯ ที่กด — ไม่ต้องเลื่อนสายตา',
      'Smart placement: ถ้าด้านล่างพอ (320px+) → โผล่ล่าง · ถ้าไม่พอ → โผล่บน',
      'Auto-clamp ขอบจอ — popup ไม่ออกนอกจอแน่นอน',
      'Backdrop จาง ๆ (0.25 alpha) ไม่บัง row อื่น — เห็น context เดิม',
      'ปุ่ม "+ เพิ่ม" ยังเป็น popup กลางจอเหมือนเดิม (ไม่มี anchor)',
    ],
  },
  {
    version: 'v0.23',
    date: '2026-06-04',
    title: 'TxnForm · Centered popup (replaces side drawer)',
    changes: [
      '🪟 เปลี่ยน edit form จาก side drawer (เลื่อนเข้ามาจากขวา) → popup กลางจอ',
      'Backdrop blur + scale animation 160ms (pops in นุ่ม ๆ)',
      'ขนาด 480px × max 88vh — เห็นทุก field โดยไม่ต้อง scroll',
      'คลิก backdrop = ปิด เหมือนเดิม · Esc ก็ปิดได้',
      'แก้ปัญหา "ตอนแก้ไขยังต้อง scroll ไปบน" — popup โผล่ตรงกลางจอเสมอ',
    ],
  },
  {
    version: 'v0.22',
    date: '2026-06-04',
    title: 'Transaction Table · Full inline editing (click any cell)',
    changes: [
      '✏️ ทุก cell ในตารางรายการธุรกรรมแก้ไขได้ inline — ไม่ต้องเปิด drawer ไม่ต้อง scroll',
      'แก้ได้: วันที่ · ชื่อรายการ · โน้ต · หมวด (dropdown) · จำนวน — คลิกเลย',
      'Enter หรือ blur = save · Esc = ยกเลิก · เครื่องหมาย +/- คงเดิมตอนแก้จำนวน',
      'รวม column "หมวด/ประเภท" เป็นอันเดียว (ลดความซ้ำซ้อน)',
      'ปุ่ม ✎ เปลี่ยนเป็น ⋯ = เปิด drawer เต็ม (ใช้ตอนต้องการแก้บัญชี/ตั้งค่าเต็ม)',
      'Drawer ไม่ auto-scroll-to-top แล้ว — เปิดที่เดิมตามที่ user อยู่',
    ],
  },
  {
    version: 'v0.21',
    date: '2026-06-04',
    title: 'Transaction Table · Notes column + auto-focus drawer',
    changes: [
      '✏️ เพิ่ม column "โน้ต" ในตารางรายการธุรกรรม + inline edit',
      '🎯 Auto-focus + scroll-to-top edit form (ภายหลังถูกแทนที่ใน v0.22)',
    ],
  },
  {
    version: 'v0.20',
    date: '2026-06-01',
    title: '🐛 Bug Fix · Debt months_paid ไม่รีเซ็ตเป็น 1 อีก',
    changes: [
      '🐛 BUG: เดิม recordDebtPayment COUNT(debt_payments) แล้วเขียนทับ months_paid ทำให้ค่าเริ่มต้นที่ user ตั้งไว้ (เช่น "จ่ายไปแล้ว 12 งวด") หายไป',
      '✅ FIX: ตรวจสอบก่อนว่าเป็นเดือนใหม่ไหม — ถ้าใช่ → +1 · ถ้าซ้ำ → ไม่แตะ months_paid',
      'deleteDebtPayment ก็แก้คู่กัน — ลด 1 (clamp ที่ 0)',
      'remaining_balance คำนวณจาก (total_months - months_paid) × monthly_payment',
      '⚠️ User ต้อง edit หนี้ที่โดน reset → ใส่ months_paid กลับเป็นค่าจริง (เช่น 13 ถ้าตั้งไว้ 12 แล้วกดจ่าย 1 ครั้ง)',
    ],
  },
  {
    version: 'v0.19',
    date: '2026-05-31',
    title: 'Trading · HTML Playbook + Daily Plan + Chart Upload',
    changes: [
      '📖 Playbook HTML standalone — เปิดที่ /playbook.html · 14 sections · personalized จาก 16 trades ของคุณ',
      'มี 3 Setups (A Bullish · B Bearish · C Trend Continuation ⭐ ตัวใหม่) · 8-item checklist · 4 entry models · ATR-based SL · risk control · 15 mistakes',
      'ปุ่ม "📖 Playbook" บนหัว Trading page · เปิด new tab',
      '📋 Daily Trading Plan card บนหน้า Trading — กรอกเองทุกวัน',
      'Weekly Bias (bullish/bearish/neutral + reason + key levels) · ใช้ร่วมระหว่างวัน',
      'Daily Bias (H4/H1 reason + invalidation + Asia/PDH/PDL key levels)',
      'News/Events + Session Plan (London/NY/Silver Bullet) free text',
      '📸 Upload chart images (multiple, resize เป็น 1200px max) — เก็บใน Supabase Storage',
      '🌙 End of Day reflection: Bias ถูก/ผิด + สรุปวันนี้',
      'Date navigator: ‹ วันก่อน · วันนี้ · วันหน้า ›',
    ],
  },
  {
    version: 'v0.18',
    date: '2026-05-31',
    title: 'Finance · Scope Transfer (1 click = 2 รายการ)',
    changes: [
      '💸 ปุ่ม "โอน scope" ที่หัวหน้า Finance — เปิด modal สำหรับโอนเงินระหว่าง personal ↔ family',
      '1 form → สร้าง 2 transactions อัตโนมัติ: -X ฝั่งจาก, +X ฝั่งรับ',
      'Direction toggle (↻ สลับ) · auto title: "โอนไปครอบครัว" / "รับจากส่วนตัว"',
      'Live preview: เห็นทั้ง 2 รายการที่จะถูกสร้างก่อนกดบันทึก',
      'Default from scope = current page · ทำที่ส่วนตัวก็ default ส่วนตัว → ครอบครัว',
      'ลดเวลาจาก 2 หน้า · 2 ฟอร์ม → 1 ฟอร์ม · ~10 วินาที',
    ],
  },
  {
    version: 'v0.17',
    date: '2026-05-31',
    title: 'Finance · แก้ไขรายการธุรกรรมได้แล้ว',
    changes: [
      '✎ ปุ่ม edit ในรายการธุรกรรม — เปลี่ยน วันที่/ชื่อ/จำนวน/หมวด/บัญชี/โน้ต ได้ทุกอย่าง',
      'TxnForm รองรับทั้ง add + edit mode — title เปลี่ยน "บันทึกรายการ" / "✎ แก้ไขรายการ" อัตโนมัติ',
      'ปุ่มลบ × hover เป็นสีแดงชัดเจน · ปุ่มแก้ ✎ hover เป็นสี accent',
      'API ใหม่: updateTransaction(id, patch)',
    ],
  },
  {
    version: 'v0.16',
    date: '2026-05-31',
    title: 'Trading Playbook · DST-Aware Killzone Times',
    changes: [
      '⏰ Killzone times now auto-shift ตาม DST ของ NY (EDT vs EST)',
      'ฤดูหนาว (พ.ย.-มี.ค.) · London 14-17, NY 19-22, Silver 22-23 (เหมือนเดิม)',
      'ฤดูร้อน (เม.ย.-ต.ค.) · London 13-16, NY 18-21, Silver 21-22 (เลื่อนเร็วขึ้น 1 ชม.)',
      'Anchor เวลาที่ NY market hours จริง (02-05, 07-10, 10-11 NY) → คำนวณ BKK auto',
      'Badge บอกชัด: "EDT · ฤดูร้อน (UTC-4)" หรือ "EST · ฤดูหนาว (UTC-5)"',
      'ใช้ Intl.DateTimeFormat API detect DST status ของ America/New_York',
    ],
  },
  {
    version: 'v0.15',
    date: '2026-05-31',
    title: 'Revert · Skip Move Money + ลบ CashboxCard',
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

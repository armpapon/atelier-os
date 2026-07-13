import { Card, CardHeader, Badge, Button } from './ui/index.js';
import { LoopMark } from './LoopMark.jsx';

export const CHANGELOG = [
  {
    version: 'v3.35',
    date: '2026-07-13',
    title: 'Journal · เมลค้างตอบไม่นับที่ลูกค้าแค่กด reaction (แก้ให้ตรงจริง)',
    badge: 'Current',
    changes: [
      '📭 อีเมลที่พนักงานส่งไปแล้วลูกค้าแค่กด 👍/🎉 ตอบ ไม่ขึ้น "เมลค้างตอบ" อีก — จับรูปแบบ reaction ของ Gmail ได้ตรงแล้ว ("🎉 ชื่อ reacted via Gmail" / "👍 ชื่อ ส่งรีแอ็กชั่น") ทั้งไทยและอังกฤษ',
      '🛡️ ปลอดภัย: เมลที่มีข้อความจริง (แม้มี emoji ปน) ยังนับค้างเหมือนเดิม ไม่ซ่อนเมลจริง',
    ],
  },
  {
    version: 'v3.33',
    date: '2026-07-13',
    title: 'Asana · นับชั่วโมงที่ไม่มีวงเล็บด้วย (3 HR / 2 HR)',
    changes: [
      '🕗 อ่านชั่วโมงจากชื่องานได้แม้ไม่มีวงเล็บ เช่น "3 HR - Shooting", "2 HR - 1st Draft" — เดิมนับเฉพาะที่ครอบวงเล็บ (1.5 HRS.) เลยตกหล่น ทำให้ยอดต่อคนไม่ครบ',
      '🛡️ ยังกันจับผิด: "Client 4", "399.-", "ชมพู่" ไม่ถูกอ่านเป็นชั่วโมง',
    ],
  },
  {
    version: 'v3.32',
    date: '2026-07-13',
    title: 'Asana · แสดงชั่วโมงเป็น 8 hr 30 min อ่านง่ายขึ้น',
    changes: [
      '🕗 การ์ดชั่วโมงทีมแสดงเป็น "8 hr 30 min" / "8 hr" / "30 min" แทนทศนิยม (8.5) — อ่านง่ายกว่า ทั้งยอดรวม, ต่อคน และแยกตามสถานะ',
    ],
  },
  {
    version: 'v3.31',
    date: '2026-07-13',
    title: 'Asana · นับงานที่ลงเป็นนาทีด้วย (30 min)',
    changes: [
      '⏱️ การ์ดชั่วโมงทีม Asana อ่านงานที่ลงเวลาเป็น "นาที" ได้แล้ว เช่น (30 min) · [45 mins] · (30 นาที) — แปลงเป็นชั่วโมงให้ (30 นาที = 0.5 ชม.) เดิมนับเฉพาะที่ลงเป็นชั่วโมง (Hr/ชม) เลยตกหล่น',
    ],
  },
  {
    version: 'v3.30',
    date: '2026-07-13',
    title: 'Journal · เปิดไวขึ้น — จำข้อมูล sync ล่าสุด + ปุ่มรีเฟรชเอง (เฟส B)',
    changes: [
      '⚡ เมลค้างตอบ · ชั่วโมงทีม Asana · Working Timeline ไม่ดึงใหม่ทุกครั้งที่สลับหน้าแล้ว — โชว์ข้อมูลล่าสุดทันที เข้าหน้า Journal ไวขึ้นมาก',
      '🕒 แต่ละการ์ดบอก "ซิงก์ HH:MM" ล่าสุด + ปุ่ม ↻ กดรีเฟรชเดี๋ยวนี้เมื่ออยากได้ realtime',
      '🔄 ถ้าข้อมูลเก่ากว่า ~4 ชม. จะดึงใหม่ให้เองเบื้องหลัง (คิดเป็นราว 2-3 รอบ/วันตามการใช้งาน) · ปิด-เปิดแอปใหม่ก็ดึงสดรอบนึง',
    ],
  },
  {
    version: 'v3.29',
    date: '2026-07-13',
    title: 'Journal · เลื่อนเวลาประชุมแล้วอัปเดตการ์ดเดิม (ไม่เบิ้ล)',
    changes: [
      '🔁 พนักงานเลื่อนเวลาประชุมใน Google Calendar (เช่น 10:00 → 12:00) แล้วกด "ดึงประชุม" — การ์ดเดิมอัปเดตเป็นเวลาใหม่ เหลือใบเดียว ไม่เพิ่มการ์ดซ้ำ · การติ๊ก "ทำแล้ว" ยังคงอยู่',
      '📊 ดึงเสร็จบอกชัด "เพิ่ม X · อัปเดต Y รายการ"',
      '⚠️ ต้องรัน migration_add_gcal_event_id.sql ใน Supabase ก่อนใช้ · การ์ดที่เคยเบิ้ลค้างไว้ ลบเองได้ในแอป หรือใช้ SQL ล้าง (ขอได้)',
    ],
  },
  {
    version: 'v3.28',
    date: '2026-07-13',
    title: 'Journal · ติ๊กนัดที่ทำแล้วได้ + ไม่ดึง "Office" จาก calendar',
    changes: [
      '✓ นัดที่ดึงจาก Google Calendar ติ๊กว่าทำเรียบร้อยได้แล้ว (เหมือนงาน) — กดปุ่ม ✓ หรือดับเบิลคลิก · ติ๊กแล้วขีดฆ่าบอกว่าจบ',
      '🏢 นัด/มาร์กที่ชื่อว่า "Office" (หรือ ออฟฟิศ) ไม่ถูกดึงมาลงวันแล้ว — กันไม่ให้รก · จับเฉพาะที่ชื่อเป็น Office ทั้งอัน (เช่น "Post-Office meeting" ยังดึงปกติ)',
    ],
  },
  {
    version: 'v3.27',
    date: '2026-07-13',
    title: 'Journal · นัดโชว์เป็นช่วงเวลา เริ่ม–จบ',
    changes: [
      '🕒 นัดที่ดึงจาก Google Calendar โชว์เป็นช่วงเวลา เช่น 12:00–13:00 (เดิมขึ้นแค่เวลาเริ่ม) — ทั้งในรายการวัน, นัดที่จะถึง และการ์ด "วันนี้" บนแดชบอร์ด · นัดที่ไม่มีเวลาจบยังขึ้นเวลาเดียวเหมือนเดิม',
    ],
  },
  {
    version: 'v3.26',
    date: '2026-07-13',
    title: 'Journal · เมลค้างตอบ กรองเมลอัตโนมัติเพิ่ม',
    changes: [
      '🧹 กรองผู้ส่งอัตโนมัติเพิ่ม 4 ราย: Shutterstock · Asana · สวนน้ำรามายณะ · SoundCloud — ไม่โผล่ในการ์ดเมลค้างตอบอีก',
      '🔍 เช็คจากชื่อผู้ส่งด้วย (ไม่ใช่แค่โดเมน) — เมลการตลาดที่ส่งผ่านโดเมนอื่นก็โดนกรอง',
    ],
  },
  {
    version: 'v3.25',
    date: '2026-07-12',
    title: 'Journal · Working Timeline ทีม AE จาก Google Sheets + เตือนวางบิล',
    changes: [
      '📋 การ์ดใหม่ Working Timeline — อ่านชีทงานของทีมสดผ่าน Google Sheets (read-only) วางลิงก์ชีทครั้งเดียวใช้ได้เลย · เลือกแท็บลูกค้าของปีปัจจุบันให้อัตโนมัติ (ข้ามแท็บบัญชี SHOPEE/Package/Boost Fee)',
      '🚨 รอวางบิล: งานที่โพสต์แล้วแต่ checkbox เก็บเงินยังไม่ครบ (ส่ง QT → เซ็น QT → ส่ง IV → เซ็น IV → จ่ายแล้ว) เรียงงานค้างนานสุดขึ้นก่อน พร้อมบอกว่าขาดขั้นไหน · โพสต์มาแล้วกี่วัน',
      '📅 งานเดือนนี้ตามวันที่เลือกใน Journal: สรุป กำลังทำ/โพสต์แล้ว + สถานะขั้นปัจจุบันของแต่ละงาน (Caption → First Draft → Final Draft → Approve) อ่านจากเส้นขีดฆ่าในชีทตรงๆ · แตะงานดูไทม์ไลน์เต็ม · กรองรายเพจได้',
      '🔧 รองรับชีทจริงของทีม: หัวคอลัมน์ Payment ภาษาไทย/อังกฤษปนกัน คอลัมน์สลับตำแหน่งข้ามแท็บ เดือนเว้นว่างต่อเนื่องจากแถวบน — หาคอลัมน์จากชื่อ header ไม่ผูกตำแหน่ง',
      '🔑 ปุ่มเชื่อม Google ทุกจุดขอสิทธิ์ครบชุด (Calendar + Gmail + Sheets) — กด consent รอบเดียว สิทธิ์เดิมไม่หลุด',
    ],
  },
  {
    version: 'v3.24',
    date: '2026-07-12',
    title: 'Journal · Asana ยึดรายคน + dashboard ภาพรวมทีม',
    changes: [
      '👥 เปลี่ยนจากเลือก project เป็น "เลือกคนในทีม" — ดึงงานจากปฏิทินของแต่ละคน (ตาม assignee) ทุก project รวมกัน · คนที่ยังไม่วางการ์ดเลยก็โชว์ 0/8',
      '📊 แถบภาพรวมทีมบนสุด: คนครบ 8 Hr · ✅ Finished · 😄 On Process · ❌ Waiting — ทุกตัวเลขเป็นชั่วโมง',
      '🧍 รายคน: แถบชั่วโมงเทียบ 8 + สถานะ 3 บรรทัด (Finished / On Process / Waiting เป็น ชม.) · ไม่ครบ 8 ขึ้นการ์ดเหลืองบอก "ขาดกี่ชม." · เรียงคนชั่วโมงน้อยสุดขึ้นก่อน · แตะชื่อดูรายการงาน',
      '⏱ parser รองรับวงเล็บท้ายชื่อแบบที่ทีมใช้จริง เช่น "ทำ artwork (3Hr)" — ของเดิม [3 Hr] ยังใช้ได้ · งานไม่ระบุชม.ขึ้นเตือนใต้ชื่อคน · emoji เชิงลบ (❌/⛔/🚫) นับเป็น Waiting ไม่ใช่พร้อมทำ',
    ],
  },
  {
    version: 'v3.23',
    date: '2026-07-12',
    title: 'Dashboard ใหม่ · Today Command Center (เฟส 1/3)',
    changes: [
      '🧭 แดชบอร์ดจัดใหม่ให้ "วันนี้" มาก่อน — การ์ดสรุปวันนี้ดึงสดจาก Daily Journal: นัดวันนี้ · งานเสร็จ x/y · อารมณ์ · Habits + นัดถัดไป และปุ่ม "เปิด Journal เต็ม"',
      '✦ North Star + ธีมสัปดาห์ย่อเป็นแถบบางด้านบน (เห็นทิศทางแต่ไม่กินที่) · Manifest/เป้าหมาย/Roadmap ย้ายลงโซน "ทิศทาง & รีวิว" ด้านล่าง',
      '⚡ Life Pulse (ภาพรวมการเงิน/เทรด/เรียน/ครอบครัว) ยังอยู่ครบ · ถัดไป (เฟส 2-3): ดึงเมลค้างตอบ/ชั่วโมงทีม + รวมโฟกัสให้เป็นแหล่งเดียวกับ Journal',
    ],
  },
  {
    version: 'v3.22',
    date: '2026-07-12',
    title: 'อ่านง่ายขึ้น · เพิ่มความคมของตัวหนังสือจาง (เฟส 6)',
    changes: [
      '🔤 ตัวหนังสือ label สีจาง (หัวข้อเล็ก ๆ, วันในปฏิทิน, ป้ายกำกับ) เข้มขึ้นให้อ่านชัดกว่าเดิม — ผ่านเกณฑ์ contrast อ่านสบาย ทั้งบนคอมและมือถือ กลางแดดก็เห็น',
    ],
  },
  {
    version: 'v3.21',
    date: '2026-07-12',
    title: 'Mobile · หน้าที่เหลือทั้งหมดใช้บนมือถือได้ (เฟส 5)',
    changes: [
      '📱 Trading · Learning · ครอบครัว · Second Brain · Life Calendar จัดใหม่บนมือถือครบ — ทุกหน้าในแอปใช้บนมือถือได้แล้ว ไม่มีหน้าไหนต้องปัดซ้าย-ขวาทั้งจออีก',
      '📊 การ์ดสถิติ Trading เรียง 2×2 · หน้ารายละเอียดคอร์ส/โน้ต Second Brain สลับเป็นคอลัมน์เดียว · ตารางเทรดปัดดูแนวนอนในกรอบตัวเอง',
      '🔖 แถบหมวดที่ยาวเกินจอ (เช่นใน Learning) ปัดเลื่อนได้ ไม่โดนตัด',
    ],
  },
  {
    version: 'v3.20',
    date: '2026-07-12',
    title: 'Mobile · จัดหน้าการเงินให้ใช้บนมือถือได้ (เฟส 4)',
    changes: [
      '💰 หน้าการเงินส่วนตัว + ครอบครัว จัดใหม่บนมือถือ — การ์ดสรุป 4 ใบเรียง 2×2 · กราฟ/หมวด/งบ/บัญชี/เป้าหมาย เรียงคอลัมน์เดียวเต็มจอ ไม่ต้องเลื่อนซ้าย-ขวา',
      '📊 ตารางรายการ (มีหลายคอลัมน์) ปัดดูแนวนอนในกรอบตัวเองบนมือถือ — แก้ในตารางได้เหมือนเดิมทุกอย่าง',
      '🔧 แก้บั๊ก: หน้าต่างเด้ง (เช่น "บันทึกรายการ") เคยหลุดออกนอกจอบนมือถือ — ตอนนี้เด้งกลางจอถูกต้องทุกหน้าต่างทั้งแอป',
    ],
  },
  {
    version: 'v3.19',
    date: '2026-07-12',
    title: 'Mobile · จัดหน้าหลัก + Journal ให้อ่านง่ายบนมือถือ (เฟส 3)',
    changes: [
      '📱 หน้าหลัก (Dashboard) + Daily Journal จัดใหม่บนมือถือ — การ์ดทุกใบเรียงคอลัมน์เดียวเต็มกว้างจอ ไม่โดนตัดขอบ ไม่ต้องเลื่อนซ้าย-ขวาอีก',
      '📝 Journal: ปฏิทิน/นัด/เมล/อารมณ์/Habits ไหลลงมาต่อกัน · หัวข้อวันที่ไม่ทับกัน · ปุ่มหัวหน้าจัดเรียงพอดีจอ',
      '👆 ปุ่มต่าง ๆ กดง่ายขึ้นบนมือถือ · จอคอมเหมือนเดิมทุกอย่าง',
    ],
  },
  {
    version: 'v3.18',
    date: '2026-07-12',
    title: 'Mobile · โครงจอมือถือใหม่ (เฟส 2)',
    changes: [
      '📱 มือถือไม่ใช่จอคอมย่อส่วนอีกต่อไป — ตัวหนังสือ/ปุ่มขนาดจริง อ่านออกกดง่าย ไม่ต้อง pinch-zoom',
      '🧭 แถบเมนูล่างแบบแอปมือถือ: หน้าหลัก · Journal · การเงิน · ครอบครัว + "เพิ่มเติม" เปิดรายการทุกโมดูล/ออกจากระบบ/เวอร์ชัน',
      '↔️ หน้าที่ยังไม่ปรับโฉมมือถือ เลื่อนซ้าย-ขวาดูได้ชั่วคราว — จะทยอยปรับทีละหน้าในเวอร์ชันถัดไป · จอคอมเหมือนเดิมทุกอย่าง',
    ],
  },
  {
    version: 'v3.17',
    date: '2026-07-12',
    title: 'Sidebar · ยุบเป็นแถบไอคอนได้ (เดสก์ท็อป)',
    changes: [
      '↔️ ปุ่มยุบ/กางเมนูข้างเลขเวอร์ชัน — ยุบเหลือแถบไอคอนแคบ ๆ ได้พื้นที่จอคืนสำหรับโฟกัสงาน · เอาเมาส์ชี้ไอคอนเห็นชื่อเมนู',
      '💾 จำสถานะไว้ให้ — เปิดใหม่ครั้งหน้าอยู่ในโหมดที่เลือกไว้ล่าสุด · ค่าเริ่มต้นยังกางเหมือนเดิม',
    ],
  },
  {
    version: 'v3.16',
    date: '2026-07-11',
    title: 'Login · ลืมรหัสผ่าน + ตั้งรหัสใหม่จากลิงก์ในเมล',
    changes: [
      '🔑 ปุ่ม "ลืมรหัสผ่าน?" ในหน้า login — กรอกอีเมลแล้วระบบส่งลิงก์ตั้งรหัสผ่านใหม่ให้ทางเมล',
      '🔒 เปิดลิงก์ในเมลแล้วเจอหน้าตั้งรหัสผ่านใหม่ทันที (กรอก 2 ครั้งกันพิมพ์ผิด) — ใช้ได้ทั้งคอมและมือถือ',
    ],
  },
  {
    version: 'v3.15',
    date: '2026-07-11',
    title: 'Journal · การ์ดชั่วโมงทีมจาก Asana (Phase 3)',
    changes: [
      '🧮 การ์ดใหม่ "ชั่วโมงทีม · Asana" ใน side panel — รวมชั่วโมง [N Hr] ในชื่อ task ต่อคน สำหรับงานที่ due วันที่เลือก · คนที่ต่ำกว่า 8 ชม. ขึ้น flag สีเหลือง · แตะชื่อคนเพื่อดูรายการงาน',
      '✅ นับงาน "พร้อมทำ" จาก emoji นำหน้าชื่อ task — โชว์ x/y พร้อมทำ ต่อคน',
      '🔗 เชื่อมด้วย Personal Access Token — วาง token ในการ์ด (ไม่ผ่านแชท/ไม่ต้อง OAuth) แล้วเลือก workspace + project ได้เลย · เปลี่ยน project ทีหลังได้ที่ปุ่ม ⚙',
    ],
  },
  {
    version: 'v3.14',
    date: '2026-07-09',
    title: 'Journal · ติ๊ก "จัดการแล้ว" เอาเมลออกจากค้างตอบเอง',
    changes: [
      '✓ ปุ่มติ๊กในแต่ละเมลค้างตอบ — เคสที่จบไปแล้วนอกอีเมล (เช่น โทรคุยแล้ว/ไม่ต้องตอบ) กดแล้วหายจากลิสต์ทันที · sync ทุกเครื่อง',
      'ฉลาดพอ: ถ้าลูกค้าส่งเมลใหม่เข้ามาในเธรดเดิมหลังติ๊ก เธรดจะเด้งกลับมาโชว์อัตโนมัติ — ไม่มีทางพลาดเมลใหม่',
      '⚠️ ต้องรัน migration_add_gmail_dismissed.sql ใน Supabase ก่อนใช้',
    ],
  },
  {
    version: 'v3.13',
    date: '2026-07-09',
    title: 'Journal · เมลค้างตอบ = ทั้งหมด ไม่จำกัดเวลา',
    changes: [
      '📬 เมลค้างตอบแสดง "ทุกฉบับที่ยังไม่ตอบ" ไม่จำกัด 7 วันแล้ว — ไล่ดูทั้ง inbox (สูงสุด 150 thread) เก่าแค่ไหนถ้ายังไม่ตอบก็ยังอยู่ · โชว์จำนวนรวมที่หัวการ์ด',
    ],
  },
  {
    version: 'v3.12',
    date: '2026-07-09',
    title: 'Journal · เมลค้างตอบบอก "ถึง" อีเมลไหน',
    changes: [
      '📧 การ์ดเมลค้างตอบเพิ่มบรรทัด "ถึง:" — บอกว่าเมลนั้นส่งเข้าอีเมล/alias ไหนของเธอ (มีประโยชน์เวลามีหลายอีเมล)',
    ],
  },
  {
    version: 'v3.11.3',
    date: '2026-07-09',
    title: 'Journal · fix เมลค้างตอบหายหมด (เอา category:primary ออก)',
    changes: [
      '🔧 เมลค้างตอบกลับมาแสดงปกติ — ตัวกรอง category:primary ทำให้เมลหายเกลี้ยงถ้าปิดแท็บหมวดหมู่ใน Gmail จึงเปลี่ยนไปกรองเมลอัตโนมัติ (Google Play/Meta/no-reply) ที่ตัว sender แทน',
    ],
  },
  {
    version: 'v3.11.2',
    date: '2026-07-09',
    title: 'Journal · กรองเมลแจ้งเตือนอัตโนมัติออกจาก "เมลค้างตอบ"',
    changes: [
      '🧹 เมลอัพเดทอัตโนมัติ (Google Play, Meta, no-reply ต่างๆ) ไม่ขึ้นในเมลค้างตอบแล้ว — กรอง sender ที่เป็น notification/no-reply',
    ],
  },
  {
    version: 'v3.11.1',
    date: '2026-07-09',
    title: 'Integrations · แสดง error จริงจาก provider',
    changes: [
      '🔧 เวลาเชื่อม API แล้วพัง จะแสดงข้อความจริงจาก Google (เช่น "Gmail API disabled", "insufficient scopes") แทน "non-2xx status code" กลางๆ',
    ],
  },
  {
    version: 'v3.11',
    date: '2026-07-09',
    title: 'Journal · Gmail — สรุปเมลลูกค้าค้างตอบ (Phase 4)',
    changes: [
      '✉️ การ์ด "เมลค้างตอบ" ในหน้า Journal — เชื่อม Gmail (readonly) แล้วสรุป thread ที่ข้อความล่าสุดมาจากลูกค้า (นอก sealinteractive.com) และยังไม่ได้ตอบ',
      'โชว์ ผู้ส่ง · หัวข้อ · ค้างมานานแค่ไหน · กดเปิดใน Gmail ได้ — reuse การเชื่อม Google เดิม แค่เพิ่มสิทธิ์ Gmail',
    ],
  },
  {
    version: 'v3.10',
    date: '2026-07-09',
    title: 'Journal · แยก "วันลา" ออกเป็นกล่อง FYI',
    changes: [
      '🌴 รายการที่เป็น "ลา" (ลาพักร้อน/ลาป่วย/ลากิจ/OOO ฯลฯ) แยกไปกล่อง "วันนี้ใครลา · FYI" — บอกให้ทราบเฉยๆ ไม่ปนกับเช็คลิสต์งานที่ต้องทำ',
      'จับแบบระวัง — งานจริงอย่าง "ส่งใบลา" หรือชื่อที่มีคำว่า ปลา/ลาว ไม่ถูกซ่อน',
    ],
  },
  {
    version: 'v3.9.1',
    date: '2026-07-09',
    title: 'Journal · fix ปุ่ม Google ไม่เปลี่ยนหลังเชื่อมสำเร็จ',
    changes: [
      '🔧 หลังเชื่อม Google สำเร็จ ปุ่มเปลี่ยนเป็น "ดึงประชุม" ทันที ไม่ต้อง refresh เอง — เดิมปุ่มเช็คสถานะก่อน token ถูกบันทึกเสร็จเลยค้าง',
    ],
  },
  {
    version: 'v3.9',
    date: '2026-07-09',
    title: 'Journal · เชื่อม Google Calendar → ดึงประชุมเข้าเช็คลิสต์',
    changes: [
      '🗓 ปุ่ม "เชื่อม Google" ในหน้า Journal — เชื่อมครั้งเดียว (ขอสิทธิ์อ่าน Calendar อย่างเดียว) แล้วปุ่มเปลี่ยนเป็น "ดึงประชุม"',
      'กด "ดึงประชุม" → ดึงตารางของวันที่เลือกจาก Google Calendar อัตโนมัติ → แปลงเป็นเหตุการณ์มีเวลา + สถานที่ เข้าเช็คลิสต์ให้เลย',
      'ข้ามประชุมที่กด declined · กันซ้ำกับรายการที่มีอยู่ — กดดึงซ้ำได้ไม่เพิ่มซ้ำ',
    ],
  },
  {
    version: 'v3.8',
    date: '2026-06-16',
    title: 'Integrations · วางราก Phase 0 (OAuth foundation)',
    changes: [
      '🔌 วางโครงระบบเชื่อม API ภายนอก — ตาราง integrations + Edge Functions (oauth-exchange, provider-proxy) + client lib',
      'รองรับ Google OAuth (เก็บ token ปลอดภัยฝั่ง server, refresh อัตโนมัติ) — ต่อยอด Calendar/Sheets/Gmail ได้',
      '⚙️ Infra — ยังไม่มี UI ให้ผู้ใช้ทั่วไป (เปิดใช้จริงใน Phase 1) · ต้องตั้ง Google Cloud + deploy Edge Functions',
    ],
  },
  {
    version: 'v3.7',
    date: '2026-06-16',
    title: 'Journal · วางตารางจาก Calendar → เช็คลิสต์ติ๊กได้',
    changes: [
      '📋 ปุ่ม "วางตาราง" — ก๊อปตารางประชุมทั้งวันจาก Google Calendar มาวาง → ระบบแยกเวลา เรียงลำดับ ทำเป็นรายการติ๊กได้อัตโนมัติ',
      'บรรทัดที่ขึ้นต้นด้วยเวลา (09:30 / 13:30-14:00) → เป็น "เหตุการณ์" มีเวลา · บรรทัดอื่น → เป็น "งาน"',
      'แทนการก๊อปไปวางใน Notes — จบในที่เดียว ติ๊กเสร็จ + เพิ่มโน้ต + แก้ไขได้',
    ],
  },
  {
    version: 'v3.6',
    date: '2026-06-16',
    title: 'Family · "วันนี้เมื่อก่อน" + คลังคำพูดของลูก',
    changes: [
      '⭐ "วันนี้เมื่อก่อน" — เด้งความทรงจำเหตุการณ์เก่าที่ตรงวันนี้ในปีก่อนๆ ขึ้นมาเอง (คลิกเปิดดูได้)',
      '💬 คลัง "คำพูดของลูก" — จดคำน่ารักที่ลูกพูด + ใครพูด + วันที่ · เก็บไว้อ่านตอนโต',
      '⚠️ ต้องรัน SQL: supabase/migration_add_family_quotes.sql',
    ],
  },
  {
    version: 'v3.5',
    date: '2026-06-16',
    title: 'Family · เหตุการณ์แนบวิดีโอ (ลิงก์) ได้',
    changes: [
      '🎬 วางลิงก์วิดีโอในเหตุการณ์ครอบครัวได้ — YouTube / Google Drive เล่นในแอปได้เลย (ไฟล์ .mp4 ก็เล่นได้)',
      'ใช้ลิงก์แทนการอัปโหลด → ไม่กินพื้นที่ storage เหมาะกับคลิปยาวไว้ดูย้อนหลัง',
      '⚠️ ต้องรัน SQL: supabase/migration_add_event_videos.sql',
    ],
  },
  {
    version: 'v3.4',
    date: '2026-06-16',
    title: 'Journal · นับถอยหลังวันนี้เป็นวงแหวนนาฬิกา',
    changes: [
      '🕒 อัปเกรดตัวนับถอยหลังเป็น "วงแหวนนาฬิกา" — อาร์คค่อยๆ หดตามเวลาที่เหลือ',
      'โชว์เวลานับสด ชม:นาที:วินาที + นาทีที่เหลือตรงกลางวง + ข้อความเตือนใจตามช่วงเวลา',
    ],
  },
  {
    version: 'v3.3',
    date: '2026-06-16',
    title: 'Journal · นับถอยหลังนาทีที่เหลือของวันนี้',
    changes: [
      '⏳ แบนเนอร์นับถอยหลังบนหน้า Daily Journal — เหลือกี่นาทีจาก 1440 นาทีของวันนี้ (นับสด)',
      'แถบความคืบหน้าของวัน + ข้อความเตือนใจตามช่วงเวลา — เตือนให้รู้คุณค่าของเวลาแต่ละวัน',
    ],
  },
  {
    version: 'v3.2',
    date: '2026-06-16',
    title: 'Finance · Debt Tracker โชว์ "วันปลอดหนี้" เป็นวันที่จริง',
    changes: [
      '🎯 แบนเนอร์ "วันปลอดหนี้" ในตัวจำลองโปะหนี้ — แปลง "อีก X เดือน" เป็นเดือน/ปีจริง (เช่น มกราคม 2571)',
      'เลื่อน slider โปะเพิ่ม → วันปลอดหนี้ขยับเร็วขึ้นแบบเรียลไทม์ + บอกประหยัดดอกเบี้ยเท่าไหร่',
    ],
  },
  {
    version: 'v3.1',
    date: '2026-06-16',
    title: 'Trading · ปฏิทิน P&L รายเดือน เห็นภาพรวมทั้งเดือน',
    changes: [
      '🗓️ ปฏิทิน P&L รายเดือนใน Trading Journal — แต่ละวันระบายสีเขียว/แดงตามกำไร-ขาดทุน + จำนวน trade',
      'มียอดรวมรายสัปดาห์ (คอลัมน์ขวา) + Monthly P&L ก้อนใหญ่ · เลื่อนเดือน ‹ › ได้',
      '(แรงบันดาลใจจากปฏิทินสไตล์ TopStep — ปรับเป็นโทน warm ของ Loop)',
    ],
  },
  {
    version: 'v3.0',
    date: '2026-06-16',
    title: 'Finance · ผูกธุรกรรมกับบิลประจำ + บิลไม่ต้องใส่ยอด',
    changes: [
      '🔁 ปุ่มผูกในแถวธุรกรรม — กดเลือกว่า "นี่คือการจ่ายบิลประจำตัวไหน" → บิลนั้นขึ้น "จ่ายแล้ว" ทันที (เหมาะกับรายการ import จากธนาคาร)',
      '💡 บิลประจำไม่ต้องใส่ยอดแล้ว — ปล่อยว่างได้ (ยอดผันแปรทุกเดือน) ใช้เป็นตัวเตือนจ่าย/ไม่จ่าย จับคู่ด้วยชื่ออย่างเดียว',
      'ถ้ายังไม่ได้รัน SQL แล้วกดผูก จะมีข้อความแจ้งให้ไปรัน migration ก่อน (เดิมเงียบ)',
      '⚠️ ต้องรัน SQL: supabase/migration_add_txn_recurring_link.sql',
    ],
  },
  {
    version: 'v2.9',
    date: '2026-06-16',
    title: 'Finance · บิลประจำกดปุ่ม "จ่ายแล้ว" ได้เลย',
    changes: [
      '✓ ปุ่ม "จ่ายแล้ว" ในบิลประจำ — กดแล้วลงรายการจ่ายของเดือนนั้นให้อัตโนมัติ สถานะเปลี่ยนเป็น "จ่ายแล้ว" ทันที',
      '(เดิมต้องลงรายการจ่ายเองให้ชื่อ+ยอดตรง ระบบถึงจับคู่ได้)',
    ],
  },
  {
    version: 'v2.8',
    date: '2026-06-16',
    title: 'Finance · การ์ด "เงินรั่ว / Insights" ชี้ว่าเงินหายไปไหน',
    changes: [
      '🩹 การ์ดใหม่ในหน้าการเงิน — อ่าน transaction จริงแล้วชี้จุดเงินรั่ว',
      'อัตราการออม + เทียบเดือนก่อน · หมวดที่โตขึ้น (lifestyle creep) · บิลซ้ำ/subscription · เล็กแต่ถี่ · ดอกเบี้ยหนี้ที่ยังต้องจ่าย',
      'แนะนำให้ "ถล่มก้อนดอกสูงสุดก่อน" (avalanche) อัตโนมัติ',
    ],
  },
  {
    version: 'v2.7',
    date: '2026-06-16',
    title: 'Family · เหตุการณ์เป็นคลังความทรงจำ — หลายรูป + กดเข้าดูได้',
    changes: [
      '🖼️ เหตุการณ์ใส่รูปได้หลายรูป (แกลเลอรี) — ไม่จำกัด 1 รูปอีกต่อไป',
      '👆 กดที่เหตุการณ์เพื่อเปิดดูรายละเอียด — แก้ชื่อ/บันทึก, เพิ่ม/ลบรูป, ดูรูปเต็มจอ (เลื่อนซ้าย-ขวา)',
      '🗂️ ไทม์ไลน์โชว์รูปปก + จำนวนรูป · เหตุการณ์ที่ผ่านมาเก็บไว้ดูย้อนหลังได้',
      '⚠️ ต้องรัน SQL: supabase/migration_add_event_photos_array.sql',
    ],
  },
  {
    version: 'v2.6',
    date: '2026-06-16',
    title: 'Family · เหตุการณ์แนบรูปความทรงจำได้',
    changes: [
      '📸 เพิ่มรูปภาพในเหตุการณ์ครอบครัวได้ (วันเกิด, ทริป, วันสำคัญ) — โผล่เป็นรูปย่อในไทม์ไลน์',
      '⚠️ ต้องรัน SQL: supabase/migration_add_event_photo.sql',
    ],
  },
  {
    version: 'v2.5',
    date: '2026-06-16',
    title: 'Second Brain · ตัวช่วยพิมพ์ — bullet, เช็กลิสต์, Enter ต่อรายการ',
    changes: [
      '⏎ กด Enter ในบรรทัด list ขึ้น marker ใหม่ให้เลย (- / ☐ / เลขลำดับ) · บรรทัดว่างกด Enter = ออกจาก list',
      '🔘 ปุ่ม • รายการ / ☐ เช็กลิสต์ / 1. ลำดับ — กดใส่/ถอด marker บรรทัดนั้นทันที',
      '⇥ Tab / Shift-Tab = เยื้องเข้า/ออก',
    ],
  },
  {
    version: 'v2.4',
    date: '2026-06-16',
    title: 'Life Calendar · โหมด "พอดีจอ" เห็นทั้งชีวิตในจอเดียว',
    changes: [
      '🔲 โหมด "พอดีจอ" (เปิดอยู่เริ่มต้น) — ย่อช่องให้ทุกแถวพอดีหน้าจอ ไม่ต้องเลื่อน เห็นภาพรวมทั้งชีวิต',
      'สลับ "ขนาดปกติ" ได้ถ้าอยากเห็นช่องใหญ่ชัดๆ (เลื่อนดู)',
    ],
  },
  {
    version: 'v2.3',
    date: '2026-06-16',
    title: 'Life Calendar · กริดขยายเต็มความกว้าง ไม่เหลือที่ว่างด้านขวา',
    changes: [
      '↔️ มุมมองสัปดาห์ขยายช่องเต็มความกว้าง — ไม่เหลือพื้นที่ว่างด้านขวา',
      'มุมมองเดือน/ปี ช่องโตขึ้นและจัดกึ่งกลาง ดูสมดุลขึ้น',
    ],
  },
  {
    version: 'v2.2',
    date: '2026-06-16',
    title: 'Second Brain · ปักหมุดเด้งขึ้นบนทันที + แยกหมวดให้ชัด',
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

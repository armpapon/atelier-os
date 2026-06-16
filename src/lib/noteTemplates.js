// ════════════════════════════════════════════════════════════════════════════
//  Second Brain — starter note templates
//  Each template seeds a new note with a title, tags, and a Thai skeleton body.
//  {date}  → today (e.g. "15 มิ.ย. 2568")
//  {month} → this month (e.g. "มิถุนายน 2568")
// ════════════════════════════════════════════════════════════════════════════

export const NOTE_TEMPLATES = [
  {
    id: 'blank',
    emoji: '📄',
    name: 'โน้ตเปล่า',
    desc: 'เริ่มจากศูนย์',
    title: 'ไม่มีชื่อ',
    tags: [],
    body: '',
  },
  {
    id: 'budget',
    emoji: '💰',
    name: 'บัญชีส่วนตัว',
    desc: 'สรุปรายรับรายจ่าย',
    title: 'บัญชีส่วนตัว · {month}',
    tags: ['การเงิน'],
    body: `เดือน: {month}

— รายรับ —
-

— รายจ่าย —
-

— สรุป —
- รวมรับ:
- รวมจ่าย:
- คงเหลือ:
- ออมได้:

— หมายเหตุ / สิ่งที่จะปรับเดือนหน้า —
-
`,
  },
  {
    id: 'workout',
    emoji: '🏋️',
    name: 'ออกกำลังกาย',
    desc: 'บันทึกการฝึก',
    title: 'ออกกำลังกาย · {date}',
    tags: ['สุขภาพ'],
    body: `วันที่: {date}
ประเภท: (วิ่ง / เวท / โยคะ / อื่นๆ)

— วันนี้ทำอะไร —
-

— เซ็ต / ระยะ / เวลา —
-

— รู้สึกยังไง —
-

— ครั้งหน้าจะ —
-
`,
  },
  {
    id: 'meditation',
    emoji: '🧘',
    name: 'นั่งสมาธิ',
    desc: 'บันทึกการภาวนา',
    title: 'นั่งสมาธิ · {date}',
    tags: ['สุขภาพ', 'สติ'],
    body: `วันที่: {date}
ระยะเวลา: ___ นาที

— ก่อนนั่ง (อารมณ์/ความคิด) —
-

— ระหว่างนั่ง (สังเกตเห็นอะไร) —
-

— หลังนั่ง (รู้สึกยังไง) —
-

— ข้อคิดที่ได้ —
-
`,
  },
  {
    id: 'meeting',
    emoji: '📝',
    name: 'บันทึกประชุม',
    desc: 'หัวข้อ + สิ่งที่ต้องทำ',
    title: 'ประชุม · {date}',
    tags: ['งาน'],
    body: `วันที่: {date}
เรื่อง:
ผู้เข้าร่วม:

— หัวข้อที่คุยกัน —
-

— สิ่งที่ตกลง / สรุป —
-

— สิ่งที่ต้องทำต่อ —
- [ ]
`,
  },
  {
    id: 'idea',
    emoji: '💡',
    name: 'ไอเดีย',
    desc: 'จับไอเดียก่อนลืม',
    title: 'ไอเดีย: ',
    tags: ['ไอเดีย'],
    body: `ไอเดีย:

— ทำไมถึงน่าสนใจ —
-

— ขั้นต่อไป —
-

— เกี่ยวข้องกับ —
- [[]]
`,
  },
  {
    id: 'book',
    emoji: '📚',
    name: 'สรุปหนังสือ',
    desc: 'ใจความ + สิ่งที่ได้',
    title: 'สรุปหนังสือ: ',
    tags: ['เรียนรู้'],
    body: `หนังสือ:
ผู้เขียน:

— ใจความหลัก —
-

— 3 สิ่งที่ได้ —
1.
2.
3.

— จะเอาไปใช้ยังไง —
-
`,
  },
  {
    id: 'weekly',
    emoji: '🎯',
    name: 'เป้าหมายสัปดาห์',
    desc: 'วางแผนสัปดาห์นี้',
    title: 'เป้าหมายสัปดาห์ · {date}',
    tags: ['แพลน'],
    body: `สัปดาห์ของ: {date}

— 3 เป้าหมายหลัก —
1.
2.
3.

— สิ่งที่ต้องทำ —
- [ ]

— ตัดทิ้งได้ (ไม่ทำก็ได้) —
-
`,
  },
];

// Replace {date} / {month} tokens with the Thai-formatted current date.
export function fillTemplateTokens(text) {
  if (!text) return text;
  const now = new Date();
  const date = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const month = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  return text.replaceAll('{date}', date).replaceAll('{month}', month);
}

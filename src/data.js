// Mock data — ภายหลังจะถูกแทนด้วย Supabase queries
export const DATA = {
  user: { name: 'อาทิตย์', initial: 'อ' },
  today: 'พฤหัสบดี · 22 พฤษภาคม 2568',
  todayShort: '22 พฤษภาคม',
  weekRange: 'สัปดาห์ที่ 21 · พ.ค. 2568',

  todayTasks: [
    { id: 1, text: 'Backtest ICT NY Session — EURUSD', tag: 'TRADE', done: true, time: '06:30' },
    { id: 2, text: 'อ่าน Inner Game of Trading บทที่ 7', tag: 'READ', done: true, time: '08:00' },
    { id: 3, text: 'พาลูกไปโรงเรียน · ส่งของให้แม่', tag: 'FAMILY', done: false, time: '07:15' },
    { id: 4, text: 'ทบทวน Live Trade 3 ตัว + เขียน Journal', tag: 'TRADE', done: false, time: '15:00' },
    { id: 5, text: 'สรุปรายจ่ายของสัปดาห์ในแอป', tag: 'FINANCE', done: false, time: '21:00' },
    { id: 6, text: 'ดู YT: "Smart Money Concepts Deep Dive" 45 นาที', tag: 'LEARN', done: false, time: '21:30' },
  ],

  kpis: [
    { label: 'Trade Win Rate', value: '64%', delta: '+4.2 สัปดาห์ก่อน', tone: 'profit' },
    { label: 'P&L เดือนนี้', value: '+฿18,420', delta: '12 trades · 8W / 4L', tone: 'profit' },
    { label: 'Spent / Budget', value: '฿24,108', delta: '60% ของ ฿40,000', tone: 'neutral' },
    { label: 'Streak Habits', value: '23 วัน', delta: 'อ่านหนังสือต่อเนื่อง', tone: 'amber' },
  ],

  trades: [
    { id: 't1', date: '22 พ.ค.', sym: 'EURUSD', side: 'long',  setup: 'OB + FVG', rr: '1:3.2', pnl: '+฿4,820', status: 'WIN' },
    { id: 't2', date: '22 พ.ค.', sym: 'GBPUSD', side: 'short', setup: 'Liquidity Sweep', rr: '1:2.1', pnl: '+฿2,640', status: 'WIN' },
    { id: 't3', date: '21 พ.ค.', sym: 'XAUUSD', side: 'long',  setup: 'BOS + OB', rr: '1:1.8', pnl: '+฿3,120', status: 'WIN' },
    { id: 't4', date: '21 พ.ค.', sym: 'USDJPY', side: 'short', setup: 'CHoCH', rr: '-1', pnl: '−฿1,800', status: 'LOSS' },
    { id: 't5', date: '20 พ.ค.', sym: 'NAS100', side: 'long',  setup: 'OB · Asian Range', rr: '1:4.0', pnl: '+฿6,400', status: 'WIN' },
    { id: 't6', date: '20 พ.ค.', sym: 'EURUSD', side: 'short', setup: 'FVG Mitigation', rr: '-1', pnl: '−฿1,800', status: 'LOSS' },
    { id: 't7', date: '19 พ.ค.', sym: 'BTCUSD', side: 'long',  setup: 'Liq Grab + OB', rr: '1:2.6', pnl: '+฿4,200', status: 'WIN' },
  ],

  courses: [
    { id: 'c1', src: 'YOUTUBE', title: 'ICT Mentorship 2024 — Market Maker Buy Model', author: 'The Inner Circle Trader', progress: 72, dur: '47 นาที' },
    { id: 'c2', src: 'YOUTUBE', title: 'Smart Money Concepts Deep Dive: Liquidity & FVG', author: 'WICKMASTER', progress: 40, dur: '1ชม 12น' },
    { id: 'c3', src: 'UDEMY',   title: 'React + TypeScript: Complete Build', author: 'Maximilian S.', progress: 55, dur: '24 ชม.' },
    { id: 'c4', src: 'YOUTUBE', title: 'Killzones & Session Bias — London Open', author: 'Photon Trading', progress: 100, dur: '34 นาที' },
    { id: 'c5', src: 'PODCAST', title: 'The Mind of a Trader — Episode 142', author: 'Chat with Traders', progress: 25, dur: '1ชม 48น' },
    { id: 'c6', src: 'BLOG',    title: 'Why I Stopped Using Indicators in 2024', author: 'Babypips', progress: 100, dur: '8 นาที' },
  ],

  books: [
    { id: 'b1', title: 'Trading in the Zone', author: 'Mark Douglas', progress: 86, cover: 'ink', glyph: 'TZ' },
    { id: 'b2', title: 'The Daily Trading Coach', author: 'Brett Steenbarger', progress: 42, cover: 'paper', glyph: 'DC' },
    { id: 'b3', title: 'อย่ายอมแพ้ ถ้ายังไม่ได้พยายามถึงที่สุด', author: 'มัตซึชิตะ โคโนสึเกะ', progress: 60, cover: 'rose', glyph: 'อ' },
    { id: 'b4', title: 'Atomic Habits', author: 'James Clear', progress: 100, cover: 'blue', glyph: 'AH' },
  ],

  journalBullets: [
    { bullet: 'star', text: 'ตื่นตี 4 ไม่งีบกลางวัน — รู้สึกหัวโล่งทั้งวัน', tag: 'WIN' },
    { bullet: 'task', done: true, text: 'Backtest EURUSD 5 setups บนกราฟ 15m', tag: 'TRADE' },
    { bullet: 'task', done: true, text: 'อ่าน Inner Game ของ Mark Douglas — บทที่ 7', tag: 'READ' },
    { bullet: 'task', done: false, text: 'เขียนสรุปสิ่งที่เรียนรู้จาก trade วันนี้ลง Notion', tag: 'NOTE' },
    { bullet: 'event', text: 'นัดประชุมกับทีมเรื่อง roadmap Q3 — 14:00', tag: 'WORK' },
    { bullet: 'migrate', text: 'ทำ portfolio review เลื่อนไปวันเสาร์', tag: 'MONEY' },
    { bullet: 'note', text: 'รู้สึกว่าตัวเอง chase trade เร็วเกินไปช่วงบ่าย — ต้องเขียนกฎใหม่' },
    { bullet: 'task', done: false, text: 'พาลูกไปสวนสาธารณะตอนเย็น', tag: 'FAMILY' },
    { bullet: 'star', text: 'ใจดีกับตัวเองมากขึ้น — ขาดทุน 1 ครั้งก็ไม่ได้แปลว่าวันนี้พัง' },
  ],

  habits: [
    { name: 'อ่านหนังสือ 30 นาที',     pattern: '111111110111110111111111101111' },
    { name: 'เขียน Trading Journal',  pattern: '111101101111111011111110110111' },
    { name: 'ออกกำลังกาย',             pattern: '101010110101101010111010100101' },
    { name: 'เข้านอนก่อน 23:00',      pattern: '111001110110110011110100111110' },
    { name: 'ไม่ดูจอก่อนนอน',         pattern: '110011001100110011010110011001' },
  ],

  moods: [
    { d: 'จ', v: 4 }, { d: 'อ', v: 5 }, { d: 'พ', v: 3 },
    { d: 'พฤ', v: 4 }, { d: 'ศ', v: 4 }, { d: 'ส', v: 5 }, { d: 'อา', v: 2 },
  ],

  balance: { total: 482610, delta: '+฿18,420 เดือนนี้' },
  accounts: [
    { name: 'KBank · ออมทรัพย์', balance: 184200, tone: 'blue' },
    { name: 'SCB · เงินเดือน',   balance: 92410,  tone: 'violet' },
    { name: 'พอร์ตหุ้น · DCA',    balance: 156800, tone: 'profit' },
    { name: 'เงินสด',              balance: 12000,  tone: 'amber' },
    { name: 'Bitcoin · Cold',     balance: 37200,  tone: 'amber' },
  ],
  transactions: [
    { id: 1, title: 'กาแฟ + ขนมเช้า · Inthanin', cat: 'อาหาร',     amount: -185, type: 'food', date: 'วันนี้ 07:42' },
    { id: 2, title: 'น้ำมัน Bangchak',           cat: 'เดินทาง',   amount: -1200, type: 'transport', date: 'วันนี้ 09:10' },
    { id: 3, title: 'เงินเดือน พ.ค.',             cat: 'รายได้',    amount: 65000, type: 'income', date: 'เมื่อวาน' },
    { id: 4, title: 'ค่าไฟ · MEA',                cat: 'บิล',       amount: -2840, type: 'bills', date: '20 พ.ค.' },
    { id: 5, title: 'Tops Daily · ของกิน',        cat: 'อาหาร',     amount: -782, type: 'food', date: '20 พ.ค.' },
    { id: 6, title: 'ซื้อหนังสือ — Kinokuniya',   cat: 'การศึกษา',  amount: -1450, type: 'shop', date: '19 พ.ค.' },
    { id: 7, title: 'Trade Profit (Withdraw)',    cat: 'รายได้',    amount: 8200, type: 'income', date: '19 พ.ค.' },
    { id: 8, title: 'ค่าเทอมลูก · งวด 2',         cat: 'ครอบครัว',   amount: -12500, type: 'bills', date: '18 พ.ค.' },
  ],
  budgets: [
    { cat: 'อาหาร & ของใช้', spent: 8420, limit: 12000 },
    { cat: 'เดินทาง',         spent: 3200, limit: 4000 },
    { cat: 'บิล & ค่าน้ำไฟ',  spent: 5840, limit: 6000 },
    { cat: 'ลูก & ครอบครัว',  spent: 14500, limit: 15000 },
    { cat: 'การศึกษา',         spent: 2150, limit: 3000 },
    { cat: 'เผื่อฉุกเฉิน',     spent: 0,    limit: 5000 },
  ],

  family: [
    { name: 'แม่ สมศรี',     role: 'แม่',        color: '#b88a5a', initial: 'ส', note: 'นัดหมอ 28 พ.ค.' },
    { name: 'พี่ ใหม่',       role: 'ภรรยา',     color: '#a78fcc', initial: 'ม', note: 'วันเกิด 14 มิ.ย.' },
    { name: 'น้องดาว',       role: 'ลูกสาว · 7', color: '#d49aa5', initial: 'ด', note: 'ประกวดกีฬาสีศุกร์นี้' },
    { name: 'น้องโชค',       role: 'ลูกชาย · 4', color: '#7ba7d4', initial: 'ช', note: 'รับวัคซีน 30 พ.ค.' },
  ],
};

-- ============================================================================
--  Atelier OS — Seed data (sample) สำหรับ user ปัจจุบัน
--  รันหลังจาก signup แล้วเท่านั้น (ต้องมี auth.uid())
--  ใน SQL Editor: รัน "select auth.uid();" เพื่อตรวจสอบว่ามี session
-- ============================================================================

-- หา user id ปัจจุบัน (ต้อง logged in ผ่าน Supabase Dashboard)
-- ถ้าจะรันใน SQL Editor ตอนยังไม่ login ให้ replace 'YOUR-USER-ID' แทน
do $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated. Sign up first, then re-run.';
  end if;

  -- Trades
  insert into public.trades (user_id, trade_date, symbol, side, setup, rr, pnl, status, session) values
    (uid, current_date,         'EURUSD', 'long',  'OB + FVG',          '1:3.2', 4820,  'WIN',  'NY'),
    (uid, current_date,         'GBPUSD', 'short', 'Liquidity Sweep',   '1:2.1', 2640,  'WIN',  'LDN'),
    (uid, current_date - 1,     'XAUUSD', 'long',  'BOS + OB',          '1:1.8', 3120,  'WIN',  'NY'),
    (uid, current_date - 1,     'USDJPY', 'short', 'CHoCH',             '-1',   -1800,  'LOSS', 'ASIA'),
    (uid, current_date - 2,     'NAS100', 'long',  'OB · Asian Range',  '1:4.0', 6400,  'WIN',  'NY'),
    (uid, current_date - 2,     'EURUSD', 'short', 'FVG Mitigation',    '-1',   -1800,  'LOSS', 'LDN'),
    (uid, current_date - 3,     'BTCUSD', 'long',  'Liq Grab + OB',     '1:2.6', 4200,  'WIN',  'NY');

  -- Accounts
  insert into public.accounts (user_id, name, type, balance, tone) values
    (uid, 'KBank · ออมทรัพย์', 'savings',    184200, 'blue'),
    (uid, 'SCB · เงินเดือน',   'checking',    92410, 'violet'),
    (uid, 'พอร์ตหุ้น · DCA',    'investment', 156800, 'profit'),
    (uid, 'เงินสด',              'cash',        12000, 'amber'),
    (uid, 'Bitcoin · Cold',     'crypto',      37200, 'amber');

  -- Transactions
  insert into public.transactions (user_id, title, category, amount, type, occurred_at) values
    (uid, 'กาแฟ + ขนมเช้า · Inthanin', 'อาหาร',     -185,    'food',      now()),
    (uid, 'น้ำมัน Bangchak',           'เดินทาง',   -1200,   'transport', now() - interval '2 hours'),
    (uid, 'เงินเดือน พ.ค.',             'รายได้',    65000,   'income',    now() - interval '1 day'),
    (uid, 'ค่าไฟ · MEA',                'บิล',       -2840,   'bills',     now() - interval '2 days'),
    (uid, 'Tops Daily · ของกิน',        'อาหาร',     -782,    'food',      now() - interval '2 days'),
    (uid, 'ซื้อหนังสือ — Kinokuniya',   'การศึกษา',  -1450,   'shop',      now() - interval '3 days'),
    (uid, 'Trade Profit (Withdraw)',    'รายได้',    8200,    'income',    now() - interval '3 days'),
    (uid, 'ค่าเทอมลูก · งวด 2',         'ครอบครัว',  -12500,  'bills',     now() - interval '4 days');

  -- Budgets
  insert into public.budgets (user_id, category, monthly_limit, month) values
    (uid, 'อาหาร & ของใช้', 12000, date_trunc('month', current_date)::date),
    (uid, 'เดินทาง',         4000,  date_trunc('month', current_date)::date),
    (uid, 'บิล & ค่าน้ำไฟ',  6000,  date_trunc('month', current_date)::date),
    (uid, 'ลูก & ครอบครัว',  15000, date_trunc('month', current_date)::date),
    (uid, 'การศึกษา',         3000,  date_trunc('month', current_date)::date),
    (uid, 'เผื่อฉุกเฉิน',     5000,  date_trunc('month', current_date)::date);

  -- Family
  insert into public.family_members (user_id, name, role, color, initial, note) values
    (uid, 'แม่ สมศรี',  'แม่',         '#b88a5a', 'ส', 'นัดหมอ 28 พ.ค.'),
    (uid, 'พี่ ใหม่',    'ภรรยา',      '#a78fcc', 'ม', 'วันเกิด 14 มิ.ย.'),
    (uid, 'น้องดาว',    'ลูกสาว · 7',  '#d49aa5', 'ด', 'ประกวดกีฬาสีศุกร์นี้'),
    (uid, 'น้องโชค',    'ลูกชาย · 4',  '#7ba7d4', 'ช', 'รับวัคซีน 30 พ.ค.');

  -- Habits
  insert into public.habits (user_id, name) values
    (uid, 'อ่านหนังสือ 30 นาที'),
    (uid, 'เขียน Trading Journal'),
    (uid, 'ออกกำลังกาย'),
    (uid, 'เข้านอนก่อน 23:00'),
    (uid, 'ไม่ดูจอก่อนนอน');

  -- Learning sources
  insert into public.learning_sources (user_id, type, title, author, progress, duration_min, category) values
    (uid, 'youtube', 'ICT Mentorship 2024 — Market Maker Buy Model', 'The Inner Circle Trader', 72,  47,  'TRADING'),
    (uid, 'youtube', 'Smart Money Concepts Deep Dive: Liquidity & FVG', 'WICKMASTER', 40,  72,  'TRADING'),
    (uid, 'udemy',   'React + TypeScript: Complete Build', 'Maximilian S.', 55, 1440, 'TECH'),
    (uid, 'youtube', 'Killzones & Session Bias — London Open', 'Photon Trading', 100, 34, 'TRADING'),
    (uid, 'podcast', 'The Mind of a Trader — Episode 142', 'Chat with Traders', 25, 108, 'TRADING'),
    (uid, 'blog',    'Why I Stopped Using Indicators in 2024', 'Babypips', 100, 8, 'TRADING');

  -- Books (เก็บใน learning_sources type=book พร้อม cover/glyph)
  insert into public.learning_sources (user_id, type, title, author, progress, cover, glyph, category) values
    (uid, 'book', 'Trading in the Zone',                              'Mark Douglas',         86,  'ink',   'TZ', 'TRADING'),
    (uid, 'book', 'The Daily Trading Coach',                          'Brett Steenbarger',    42,  'paper', 'DC', 'TRADING'),
    (uid, 'book', 'อย่ายอมแพ้ ถ้ายังไม่ได้พยายามถึงที่สุด',          'มัตซึชิตะ โคโนสึเกะ',  60,  'rose',  'อ',  'LIFE'),
    (uid, 'book', 'Atomic Habits',                                    'James Clear',         100,  'blue',  'AH', 'LIFE');

  -- Financial goal
  insert into public.financial_goals (user_id, title, target_amount, current_amount) values
    (uid, 'down ค่าบ้าน', 600000, 382000);

end $$;

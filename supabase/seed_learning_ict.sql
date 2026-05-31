-- ============================================================================
--  Seed Learning Hub — ICT Trading Curriculum
--  ปรับให้ตรงกับ gaps จริงของ Parnrada (อิงจาก 16 trades · 20% WR · -$84)
--  Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================================

INSERT INTO public.learning_sources (user_id, type, title, author, url, duration_min, progress, status, cover, glyph, category)
SELECT u.id, t.type, t.title, t.author, t.url, t.duration_min, 0, 'active', t.cover, t.glyph, t.category
FROM auth.users u
CROSS JOIN (VALUES

  -- ─── PRIORITY #1 · MTF Confluence (กัน loss แบบ "FVG M5 เดียว") ────────────
  ('youtube',
    'ICT 2022 Mentorship — Episode 1: Market Structure',
    'The Inner Circle Trader',
    'https://www.youtube.com/playlist?list=PLnDcw9zJxBkmDLcgGZA0G6w_uTgWGQEjL',
    60, 'ink', 'ICT', 'TRADING'),

  ('youtube',
    'Multi-Timeframe Analysis — H4 → H1 → M15 Confluence',
    'TheInnerCircleTrader',
    'https://www.youtube.com/results?search_query=ICT+multi+timeframe+analysis+H4+M15',
    45, 'blue', 'MTF', 'TRADING'),

  -- ─── PRIORITY #2 · Confirmation vs Anticipation Entry ──────────────────────
  ('youtube',
    'Confirmation Entry — รอ M5 BOS/ChoCH ก่อน Entry',
    'ICT Concepts',
    'https://www.youtube.com/results?search_query=ICT+confirmation+entry+BOS+CHoCH',
    30, 'paper', 'CE', 'TRADING'),

  ('youtube',
    'Judas Swing Setup — เทพแห่ง Asia Sweep Reverse',
    'The Inner Circle Trader',
    'https://www.youtube.com/results?search_query=ICT+judas+swing+setup',
    25, 'rose', 'JS', 'TRADING'),

  -- ─── PRIORITY #3 · Liquidity Sweep + Reclaim ───────────────────────────────
  ('youtube',
    'Liquidity Sweep + Reclaim — Setup เดียวที่คุณชนะ 100%',
    'TraderDante',
    'https://www.youtube.com/results?search_query=liquidity+sweep+reclaim+FVG+entry',
    35, 'ink', 'LIQ', 'TRADING'),

  ('youtube',
    'Killzones Theory — London / NY / Silver Bullet',
    'The Inner Circle Trader',
    'https://www.youtube.com/results?search_query=ICT+killzones+london+new+york+silver+bullet',
    40, 'paper', 'KZ', 'TRADING'),

  -- ─── PRIORITY #4 · Trade Management (แก้ปัญหา 4/15 BE จาก +$80) ────────────
  ('youtube',
    'Partial TP + Trailing SL — Lock Profit Without Greed',
    'Various ICT',
    'https://www.youtube.com/results?search_query=trade+management+partial+TP+trailing+stop+loss',
    20, 'blue', 'TM', 'TRADING'),

  -- ─── PRIORITY #5 · Psychology & Discipline (root cause ของทุก loss) ────────
  ('book',
    'Trading In The Zone',
    'Mark Douglas',
    'https://www.amazon.com/Trading-Zone-Confidence-Discipline-Attitude/dp/0735201447',
    480, 'paper', 'TZ', 'PSYCH'),

  ('book',
    'The Disciplined Trader',
    'Mark Douglas',
    'https://www.amazon.com/Disciplined-Trader-Developing-Winning-Attitudes/dp/0132157578',
    420, 'ink', 'DT', 'PSYCH'),

  ('book',
    'Best Loser Wins — เรียนแพ้ให้เป็นก่อนเรียนชนะ',
    'Tom Hougaard',
    'https://www.amazon.com/Best-Loser-Wins-Trading-Performance/dp/0857198777',
    320, 'rose', 'BL', 'PSYCH'),

  -- ─── PRIORITY #6 · Risk Management (ลด lot, fix DD) ────────────────────────
  ('youtube',
    'Position Sizing 101 — 1% Rule + R Multiple System',
    'Anton Kreil / SMB',
    'https://www.youtube.com/results?search_query=position+sizing+1+percent+rule+forex',
    25, 'blue', 'PS', 'RISK'),

  ('blog',
    'Build Your Own Trading Plan — A Step-by-Step',
    'BabyPips School',
    'https://www.babypips.com/learn/forex/trading-plan-tutorial',
    180, 'paper', 'PL', 'RISK'),

  -- ─── BONUS · ระดับ advanced (อ้างอิงต่อในอนาคต) ─────────────────────────────
  ('podcast',
    'Chat with Traders — Sessions on FX & Discipline',
    'Aaron Fifield',
    'https://chatwithtraders.com/episodes/',
    600, 'ink', 'CT', 'PODCAST'),

  ('youtube',
    'Smart Money Concepts — Order Block + FVG Mastery',
    'TraderDante / Wyckoff',
    'https://www.youtube.com/results?search_query=smart+money+concepts+order+block+FVG',
    50, 'blue', 'SMC', 'TRADING')

) AS t(type, title, author, url, duration_min, cover, glyph, category)
WHERE u.email = 'armpapon@gmail.com';

-- ── Bonus: ตั้ง first note ให้กับ Trading In The Zone ─────────────────────
INSERT INTO public.learning_notes (user_id, source_id, title, body)
SELECT u.id, s.id, 'เริ่มที่นี่',
  E'หนังสือเล่มนี้คือ root cause ของ 12 loss ที่ผ่านมา ไม่ใช่ technical\n\n' ||
  '"Anything can happen" — ทุก trade เป็นเรื่องของ probability ไม่ใช่ certainty\n' ||
  'Stop seeing each loss as personal failure — see it as cost of doing business\n\n' ||
  'อ่านบทที่ 1-3 ก่อน (Setup the Foundation) — 1 ชั่วโมง · บันทึก insight ใส่ note นี้'
FROM auth.users u
JOIN public.learning_sources s ON s.user_id = u.id AND s.title = 'Trading In The Zone'
WHERE u.email = 'armpapon@gmail.com';

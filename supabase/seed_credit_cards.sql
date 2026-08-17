-- ════════════════════════════════════════════════════════════════════════════
--  บัตรเครดิต — production seed: the three real cards (v4.43 · วงเงินร่วม)
--
--  ALREADY APPLIED to production on 2026-08-16 via the Supabase MCP, in the
--  same session that ran migration_add_credit_cards.sql (v4.36),
--  migration_add_credit_cards_face.sql (v4.41) and
--  migration_add_credit_cards_shared_limit.sql (v4.43). This file is NOT a
--  pending migration — nothing here needs to be run again. It exists so the
--  three seeded cards, their two linked debts, the face_url values, the
--  shared KTC credit line and the KBank usage tips are reproducible from the
--  repo instead of living only in Supabase.
--
--  §6 (the nine KBank PLUSTINUM tips behind the "วิธีใช้ให้คุ้ม" accordion)
--  was APPLIED 2026-08-17 via the Supabase MCP, in the v4.44 session.
--
--  Every statement is idempotent (INSERT ... WHERE NOT EXISTS, UPDATE ...
--  guarded by IS DISTINCT FROM / IS NULL) — re-running it in the SQL Editor
--  changes nothing on a database that already has these rows.
--
--  Cards seeded
--    · KBank PLUSTINUM       — personal — no revolving balance, waiver counter
--    · KTC วิศวจุฬา Platinum  — family   — revolving balance, linked to a debt,
--                                          OWNS the 150,000฿ KTC credit line
--    · KTC VISA PLATINUM     — family   — revolving balance, linked to a debt,
--                                          SHARES the Mastercard's line
--
--  The KTC line, in the owner's words (16 ส.ค. 69):
--    "จริงๆ KTC มี 2 ใบ mastercard คือบัตรหลัก Visa คือบัตรคล้ายบัตรเสริม
--     แต่ใช้วงเงินร่วมกับบัตรเเรก สองบัตรรวมกันคือ 150000"
--  So the Mastercard carries credit_limit = 150000 and the Visa carries
--  credit_limit = NULL + shared_limit_card_id → the Mastercard (§5 below).
--
--  fee_profile values are transcribed from the approved mockup
--  (loop-credit-cards-mockup.html, ตรวจกับ ธปท. 16 ส.ค. 69) — the jsonb key
--  names match src/lib/creditCards.js FEE_PROFILE_FIELDS plus bot_url /
--  bot_checked (see migration_add_credit_cards.sql for the shape).
--
--  Deliberately NOT seeded: statement_day / due_day on all three cards. The
--  mockup marks those with `*` — "ตัวเลขที่มี * ยังเป็นค่าสมมติรอ CEO กรอกเอง"
--  — so they stay NULL here rather than ship a fabricated real-world date.
--  (The KTC limit is no longer in that bucket: the owner stated it himself.)
--
--  Uses the `WHERE email = 'armpapon@gmail.com'` user subquery per CLAUDE.md
--  §3 (auth.uid() is NULL when run as postgres in the SQL Editor).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · the three cards ──────────────────────────────────────────────────────

INSERT INTO public.credit_cards (
  user_id, scope, name, issuer, network, status, pays_full,
  credit_limit, opened_note,
  waiver_mode, waiver_target, waiver_progress, waiver_period_note,
  annual_fee, fee_profile, sort_order
)
SELECT
  (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com'),
  'personal', 'KBank PLUSTINUM', 'KBank', 'Visa', 'active', true,
  300000, 'เปิด ส.ค. 2569 · autopay จ่ายเต็ม',
  'count', 12, 0, 'รอบปีบัตร ส.ค. 69 – ก.ค. 70',
  1250,
  jsonb_build_object(
    'annual_fee_display', 'ปีแรกฟรี · ปีถัดไป 1,250฿ — ฟรีเมื่อรูด ≥12 ครั้ง/ปี',
    'interest',           '16% ต่อปี',
    'cash_advance',       '2.5% + VAT · ถอนขั้นต่ำ 2,000฿/ครั้ง',
    'fx',                 'ไม่เกิน 2.5%',
    'benefits',           'K Point สูงสุด X3 (กิน/ห้าง/แฟชั่น เมื่อครบ 8,000฿/ด.) · E-Coupon สูงสุด 260฿/ด. (ใช้ ≥10,000฿) · Cashback สูงสุด 25% เดือนเกิด · Miracle Lounge 2 ครั้ง/ปี ไม่จำกัดสายการบิน · ประกันเดินทาง 200,000฿ เมื่อจ่ายค่าตั๋วด้วยบัตร',
    'bot_url',            'https://app.bot.or.th/1213/MCPD/FeeApp/CreditFee',
    'bot_checked',        '16 ส.ค. 69'
  ),
  0
WHERE NOT EXISTS (
  SELECT 1 FROM public.credit_cards
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com')
    AND name = 'KBank PLUSTINUM'
);

INSERT INTO public.credit_cards (
  user_id, scope, name, issuer, network, status, pays_full,
  credit_limit, manual_balance, opened_note, waiver_mode, fee_profile, sort_order
)
SELECT
  (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com'),
  'family', 'KTC วิศวจุฬา Platinum', 'KTC', 'Mastercard', 'active', false,
  150000, 50674, 'co-brand · หนี้หมุนอยู่ · บัตรหลักของวงเงิน KTC', 'none',
  jsonb_build_object(
    'annual_fee_display', 'ฟรี ไม่มีเงื่อนไข (ใบแรกของแบรนด์)',
    'interest',           '16% ต่อปี',
    'cash_advance',       '3% · ถอนขั้นต่ำ 500฿ · คิดดอกทันที',
    'fx',                 'ไม่เกิน 2.0% — ถูกสุดใน 4 ใบ',
    'bot_url',            'https://app.bot.or.th/1213/MCPD/FeeApp/CreditFee',
    'bot_checked',        '16 ส.ค. 69'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM public.credit_cards
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com')
    AND name = 'KTC วิศวจุฬา Platinum'
);

INSERT INTO public.credit_cards (
  user_id, scope, name, issuer, network, status, pays_full,
  manual_balance, opened_note, waiver_mode, fee_profile, sort_order
)
SELECT
  (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com'),
  'family', 'KTC VISA PLATINUM', 'KTC', 'Visa', 'active', false,
  60817, 'ใบใส · หนี้หมุนอยู่', 'none',
  jsonb_build_object(
    'annual_fee_display', 'ฟรี ไม่มีเงื่อนไข (ใบแรกของแบรนด์)',
    'interest',           '16% ต่อปี',
    'cash_advance',       '3% · ถอนขั้นต่ำ 500฿ · คิดดอกทันที',
    'fx',                 'ไม่เกิน 2.0% — ถูกสุดใน 4 ใบ',
    'bot_url',            'https://app.bot.or.th/1213/MCPD/FeeApp/CreditFee',
    'bot_checked',        '16 ส.ค. 69'
  ),
  2
WHERE NOT EXISTS (
  SELECT 1 FROM public.credit_cards
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com')
    AND name = 'KTC VISA PLATINUM'
);

-- ── 2 · the two linked debts ─────────────────────────────────────────────────
-- Same shape as every other row in `debts` (migration_add_debts.sql):
-- monthly_payment is the minimum, remaining_balance the current revolving
-- balance, interest_rate the ธปท. ceiling both cards sit at.

INSERT INTO public.debts (
  user_id, name, monthly_payment, due_day, remaining_balance,
  interest_rate, type, scope, is_active
)
SELECT
  (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com'),
  'KTC Mastercard (วิศวจุฬา)', 4054, 5, 50674, 16, 'credit_card', 'family', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.debts
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com')
    AND name = 'KTC Mastercard (วิศวจุฬา)'
);

INSERT INTO public.debts (
  user_id, name, monthly_payment, due_day, remaining_balance,
  interest_rate, type, scope, is_active
)
SELECT
  (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com'),
  'KTC VISA Platinum', 4865, 5, 60817, 16, 'credit_card', 'family', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.debts
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com')
    AND name = 'KTC VISA Platinum'
);

-- ── 3 · link each KTC card to its debt row ───────────────────────────────────
-- Once debt_id is set, src/lib/creditCards.js `cardBalance()` reads the
-- DEBT's remaining_balance as the truth and ignores manual_balance — the
-- column above is only the seed value / fallback if the link is ever cleared.

UPDATE public.credit_cards c
SET debt_id = d.id
FROM public.debts d
WHERE c.user_id = (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com')
  AND d.user_id = c.user_id
  AND c.name = 'KTC วิศวจุฬา Platinum'
  AND d.name = 'KTC Mastercard (วิศวจุฬา)'
  AND c.debt_id IS NULL;

UPDATE public.credit_cards c
SET debt_id = d.id
FROM public.debts d
WHERE c.user_id = (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com')
  AND d.user_id = c.user_id
  AND c.name = 'KTC VISA PLATINUM'
  AND d.name = 'KTC VISA Platinum'
  AND c.debt_id IS NULL;

-- ── 4 · face_url — the images this repo ships in public/cards/ ─────────────

UPDATE public.credit_cards
SET face_url = '/cards/kbank-plustinum.png'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com')
  AND name = 'KBank PLUSTINUM'
  AND face_url IS DISTINCT FROM '/cards/kbank-plustinum.png';

UPDATE public.credit_cards
SET face_url = '/cards/ktc-chula.png'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com')
  AND name = 'KTC วิศวจุฬา Platinum'
  AND face_url IS DISTINCT FROM '/cards/ktc-chula.png';

UPDATE public.credit_cards
SET face_url = '/cards/ktc-visa-platinum.png'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com')
  AND name = 'KTC VISA PLATINUM'
  AND face_url IS DISTINCT FROM '/cards/ktc-visa-platinum.png';

-- ── 5 · วงเงินร่วม — the two KTC cards are ONE 150,000฿ line ─────────────────
-- Requires migration_add_credit_cards_shared_limit.sql (v4.43).
-- The Mastercard OWNS the line, the Visa spends it:
--   Mastercard → credit_limit 150000, shared_limit_card_id NULL
--   Visa       → credit_limit NULL,   shared_limit_card_id = the Mastercard
-- src/lib/creditCards.js `lineOf`/`lineBalance` then show 111,491 / 150,000฿
-- (50,674 + 60,817) on BOTH cards, and count the 150,000 once in the header.

-- The owner's row must come back as an OWNER on a rerun, so this statement
-- clears shared_limit_card_id as well: if the graph ever drifts (the main card
-- gets pointed at the Visa), setting only the limit would leave a card that
-- holds 150,000฿ and spends someone else's line at the same time.
UPDATE public.credit_cards
SET credit_limit = 150000,
    shared_limit_card_id = NULL
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com')
  AND name = 'KTC วิศวจุฬา Platinum'
  AND (credit_limit IS DISTINCT FROM 150000 OR shared_limit_card_id IS NOT NULL);

UPDATE public.credit_cards v
SET shared_limit_card_id = m.id,
    credit_limit = NULL
FROM public.credit_cards m
WHERE v.user_id = (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com')
  AND m.user_id = v.user_id
  AND v.name = 'KTC VISA PLATINUM'
  AND m.name = 'KTC วิศวจุฬา Platinum'
  AND (v.shared_limit_card_id IS DISTINCT FROM m.id OR v.credit_limit IS NOT NULL);

-- ── 6 · วิธีใช้ให้คุ้ม — the KBank PLUSTINUM tips (v4.44) ────────────────────
-- APPLIED to production on 2026-08-17 via the Supabase MCP, at the same time
-- the accordion shipped. Recorded here because the nine sentences ARE the
-- feature: they are curated research, not generated at render time, so a fresh
-- environment (or a row that lost them) has to be able to get them back from
-- the repo instead of from a screenshot.
--
-- jsonb || jsonb merges the two keys into whatever fee_profile already holds,
-- leaving the ธปท. keys above untouched. The guard compares both keys, so a
-- rerun on a database that already has them is a no-op.

UPDATE public.credit_cards
SET fee_profile = COALESCE(fee_profile, '{}'::jsonb) || jsonb_build_object(
  'tips_updated', '17 ส.ค. 2569',
  'tips', jsonb_build_array(
    'รับคะแนน K Point 1 คะแนน ต่อการใช้จ่ายทุก 25 บาท ในทุกหมวดการใช้จ่าย',
    'รับคะแนนสูงสุด 3 เท่า เมื่อใช้จ่ายหมวดร้านอาหาร ห้างสรรพสินค้า และร้านค้าแฟชั่น รวมครบ 8,000 บาทขึ้นไปต่อเดือน — แนะนำให้นำค่าอาหารและค่าใช้จ่ายในห้างที่จ่ายประจำอยู่แล้ว มาชำระผ่านบัตรนี้',
    'รับสิทธิ์กด E-Coupon มูลค่าสูงสุด 260 บาทต่อเดือน ในแอป K PLUS เมื่อใช้จ่ายรวมครบ 10,000 บาทขึ้นไปต่อเดือน (จำกัด 1 สิทธิ์ต่อบัตรต่อเดือน และสิทธิ์มีจำนวนจำกัด) — แนะนำให้กดรับทันทีที่ยอดครบ',
    'เดือนเกิด: แลกคะแนนเท่ายอดใช้จ่าย รับเครดิตเงินคืนสูงสุด 25% (แลกได้ไม่เกิน 5,000 คะแนน รับเงินคืนสูงสุด 1,250 บาทต่อปี จำกัด 1 เซลล์สลิปต่อปี) — แนะนำให้รวมรายจ่ายก้อนใหญ่ประมาณ 5,000 บาทไว้ในบิลเดียว',
    'ชำระค่าบัตรโดยสารเครื่องบินด้วยบัตรนี้ รับความคุ้มครองประกันการเดินทางสูงสุด 200,000 บาท และกระเป๋าเดินทางล่าช้า/สูญหายสูงสุด 20,000 บาท พร้อมใช้ห้องรับรอง Miracle Lounge สนามบินสุวรรณภูมิได้ 2 ครั้งต่อปี ไม่จำกัดสายการบิน',
    'ใช้คะแนนสะสม 500 คะแนน แลกประกันอุบัติเหตุวงเงินคุ้มครอง 100,000 บาทได้ (สิทธิ์มีจำนวนจำกัดต่อเดือน)',
    'รับยกเว้นค่าธรรมเนียมรายปี 1,250 บาท เมื่อใช้จ่ายผ่านบัตรตั้งแต่ 12 ครั้งต่อปีขึ้นไป (นับจำนวนครั้ง ไม่กำหนดยอดขั้นต่ำต่อครั้ง)',
    'ข้อควรระวัง: ไม่ควรใช้จ่ายเพิ่มเพียงเพื่อให้ถึงเงื่อนไขโปรโมชั่น — ระหว่างที่ยังมียอดค้างบัตร KTC ดอกเบี้ย 16% ต่อปีสูงกว่ามูลค่าคะแนนที่จะได้รับ',
    'สิทธิประโยชน์ชุดนี้มีระยะเวลาถึง 31 ธันวาคม 2569'
  )
)
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com')
  AND name = 'KBank PLUSTINUM'
  AND (
    fee_profile -> 'tips_updated' IS DISTINCT FROM to_jsonb('17 ส.ค. 2569'::text)
    OR fee_profile -> 'tips' IS DISTINCT FROM jsonb_build_array(
      'รับคะแนน K Point 1 คะแนน ต่อการใช้จ่ายทุก 25 บาท ในทุกหมวดการใช้จ่าย',
      'รับคะแนนสูงสุด 3 เท่า เมื่อใช้จ่ายหมวดร้านอาหาร ห้างสรรพสินค้า และร้านค้าแฟชั่น รวมครบ 8,000 บาทขึ้นไปต่อเดือน — แนะนำให้นำค่าอาหารและค่าใช้จ่ายในห้างที่จ่ายประจำอยู่แล้ว มาชำระผ่านบัตรนี้',
      'รับสิทธิ์กด E-Coupon มูลค่าสูงสุด 260 บาทต่อเดือน ในแอป K PLUS เมื่อใช้จ่ายรวมครบ 10,000 บาทขึ้นไปต่อเดือน (จำกัด 1 สิทธิ์ต่อบัตรต่อเดือน และสิทธิ์มีจำนวนจำกัด) — แนะนำให้กดรับทันทีที่ยอดครบ',
      'เดือนเกิด: แลกคะแนนเท่ายอดใช้จ่าย รับเครดิตเงินคืนสูงสุด 25% (แลกได้ไม่เกิน 5,000 คะแนน รับเงินคืนสูงสุด 1,250 บาทต่อปี จำกัด 1 เซลล์สลิปต่อปี) — แนะนำให้รวมรายจ่ายก้อนใหญ่ประมาณ 5,000 บาทไว้ในบิลเดียว',
      'ชำระค่าบัตรโดยสารเครื่องบินด้วยบัตรนี้ รับความคุ้มครองประกันการเดินทางสูงสุด 200,000 บาท และกระเป๋าเดินทางล่าช้า/สูญหายสูงสุด 20,000 บาท พร้อมใช้ห้องรับรอง Miracle Lounge สนามบินสุวรรณภูมิได้ 2 ครั้งต่อปี ไม่จำกัดสายการบิน',
      'ใช้คะแนนสะสม 500 คะแนน แลกประกันอุบัติเหตุวงเงินคุ้มครอง 100,000 บาทได้ (สิทธิ์มีจำนวนจำกัดต่อเดือน)',
      'รับยกเว้นค่าธรรมเนียมรายปี 1,250 บาท เมื่อใช้จ่ายผ่านบัตรตั้งแต่ 12 ครั้งต่อปีขึ้นไป (นับจำนวนครั้ง ไม่กำหนดยอดขั้นต่ำต่อครั้ง)',
      'ข้อควรระวัง: ไม่ควรใช้จ่ายเพิ่มเพียงเพื่อให้ถึงเงื่อนไขโปรโมชั่น — ระหว่างที่ยังมียอดค้างบัตร KTC ดอกเบี้ย 16% ต่อปีสูงกว่ามูลค่าคะแนนที่จะได้รับ',
      'สิทธิประโยชน์ชุดนี้มีระยะเวลาถึง 31 ธันวาคม 2569'
    )
  );

-- ── Check it landed ─────────────────────────────────────────────────────────
-- select name, scope, manual_balance, debt_id, face_url, credit_limit,
--        shared_limit_card_id
--   from public.credit_cards order by sort_order;
-- select name, fee_profile -> 'tips_updated' as tips_updated,
--        jsonb_array_length(fee_profile -> 'tips') as tip_count
--   from public.credit_cards where name = 'KBank PLUSTINUM';
-- select name, remaining_balance, interest_rate, monthly_payment from public.debts where type = 'credit_card';

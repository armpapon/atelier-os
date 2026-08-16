-- ════════════════════════════════════════════════════════════════════════════
--  บัตรเครดิต — production seed: the three real cards (v4.42 · A5 follow-up)
--
--  ALREADY APPLIED to production on 2026-08-16 via the Supabase MCP, in the
--  same session that ran migration_add_credit_cards.sql (v4.36) and
--  migration_add_credit_cards_face.sql (v4.41). This file is NOT a pending
--  migration — nothing here needs to be run again. It exists so the three
--  seeded cards, their two linked debts, and the face_url values are
--  reproducible from the repo instead of living only in Supabase.
--
--  Every statement is idempotent (INSERT ... WHERE NOT EXISTS, UPDATE ...
--  guarded by IS DISTINCT FROM / IS NULL) — re-running it in the SQL Editor
--  changes nothing on a database that already has these rows.
--
--  Cards seeded
--    · KBank PLUSTINUM       — personal — no revolving balance, waiver counter
--    · KTC วิศวจุฬา Platinum  — family   — revolving balance, linked to a debt
--    · KTC VISA PLATINUM     — family   — revolving balance, linked to a debt
--
--  fee_profile values are transcribed from the approved mockup
--  (loop-credit-cards-mockup.html, ตรวจกับ ธปท. 16 ส.ค. 69) — the jsonb key
--  names match src/lib/creditCards.js FEE_PROFILE_FIELDS plus bot_url /
--  bot_checked (see migration_add_credit_cards.sql for the shape).
--
--  Deliberately NOT seeded: credit_limit / statement_day / due_day on the two
--  KTC cards, and statement_day / due_day on the KBank card. The mockup marks
--  those with `*` — "ตัวเลขที่มี * ยังเป็นค่าสมมติรอ CEO กรอกเอง" — so they
--  stay NULL here rather than ship a fabricated real-world date or limit.
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
  manual_balance, opened_note, waiver_mode, fee_profile, sort_order
)
SELECT
  (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com'),
  'family', 'KTC วิศวจุฬา Platinum', 'KTC', 'Mastercard', 'active', false,
  50674, 'co-brand · หนี้หมุนอยู่', 'none',
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

-- ── Check it landed ─────────────────────────────────────────────────────────
-- select name, scope, manual_balance, debt_id, face_url from public.credit_cards order by sort_order;
-- select name, remaining_balance, interest_rate, monthly_payment from public.debts where type = 'credit_card';

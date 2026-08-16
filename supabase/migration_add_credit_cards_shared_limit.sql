-- ════════════════════════════════════════════════════════════════════════════
--  บัตรเครดิต — วงเงินร่วม (credit_cards.shared_limit_card_id) · v4.43
--
--  ALREADY APPLIED to production on 2026-08-16 via the Supabase MCP, together
--  with the two KTC rows this commit's seed file now records (the Mastercard
--  carries credit_limit = 150000, the Visa carries credit_limit = NULL and
--  points at the Mastercard). This file is NOT a pending migration — it exists
--  so the repo carries the record of the column. It is idempotent, so
--  re-running it in the SQL Editor is harmless.
--
--  WHY
--  The owner holds TWO KTC cards that are ONE credit line:
--    "จริงๆ KTC มี 2 ใบ mastercard คือบัตรหลัก Visa คือบัตรคล้ายบัตรเสริม
--     แต่ใช้วงเงินร่วมกับบัตรเเรก สองบัตรรวมกันคือ 150000"
--  Before this column the app modelled every card as its own limit, so the two
--  KTC cards either double-counted a 150,000฿ line as 300,000฿ or showed the
--  Visa as "ยังไม่ได้ใส่วงเงิน". Both are wrong in the same direction: they
--  make the credit-bureau utilisation look healthier than the bank sees it.
--
--  WHAT IT IS
--  A nullable self-reference. NULL = this card OWNS its line and its own
--  `credit_limit` is that line's limit. Set = this card SPENDS another card's
--  line; its own `credit_limit` is left NULL and every utilisation figure it
--  shows is the LINE's (owner balance + sharer balances ÷ the owner's limit).
--
--  ON DELETE SET NULL, not CASCADE: deleting the main card must never delete
--  the supplementary one. The sharer simply becomes an ordinary card again.
--
--  There is deliberately no CHECK forbidding self-reference or cycles. The
--  resolver in src/lib/creditCards.js (`lineOf`) already treats a self-pointing
--  row, a missing target and a two-card cycle as "this card owns its own
--  line" — a rendering rule belongs with the renderer, and a constraint that
--  rejects the row would turn a harmless mistake into a failed save.
--
--  RUN ONCE IN SUPABASE SQL EDITOR.  Idempotent — safe to re-run.
--  Suggested tab name: loop_credit_cards_shared_limit
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS shared_limit_card_id uuid
  REFERENCES public.credit_cards(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.credit_cards.shared_limit_card_id IS
  'This card spends ANOTHER card''s credit line (KTC Visa → KTC Mastercard). NULL = the card owns its line and credit_limit is that line''s limit.';

-- ── Check it landed ─────────────────────────────────────────────────────────
-- select c.name, c.credit_limit, m.name as shares_limit_with
--   from public.credit_cards c
--   left join public.credit_cards m on m.id = c.shared_limit_card_id
--  order by c.sort_order;

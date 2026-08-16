-- ════════════════════════════════════════════════════════════════════════════
--  บัตรเครดิต — credit_cards (v4.36)
--
--  CONTEXT
--  One row per PLASTIC. This table is the owner's own record of the cards he
--  holds — it is NOT a ledger. Spending still lives in `transactions`, and a
--  revolving balance still lives in `debts`; a card that carries a balance
--  points at its debt row through `debt_id` so the two can never disagree.
--
--  Balance resolution (src/lib/creditCards.js):
--    debt_id set   → debts.remaining_balance is the truth
--    debt_id null  → manual_balance, typed by the owner
--
--  `fee_profile` and `installments` are jsonb on purpose. The ธปท. fee sheet
--  is prose that changes shape per issuer (and per campaign), and 0% instalment
--  plans come and go monthly; neither deserves a column, a constraint, or a
--  backfill.
--    fee_profile  = { annual_fee_display, interest, cash_advance, fx,
--                     benefits, bot_url, bot_checked }
--    installments = [{ label, principal, per_month, paid, total }]
--
--  Annual-fee waiver: `waiver_mode` says HOW the issuer counts.
--    'none'   → free, no strings (KTC)
--    'count'  → number of swipes per card year (KBank: 12 ครั้ง)
--    'amount' → baht spent per card year (CardX: 100,000฿)
--  `waiver_progress` is typed by the owner — the app never infers it from
--  transactions, because a card year is not a calendar year and only the
--  statement knows which swipes counted.
--
--  RUN ONCE IN SUPABASE SQL EDITOR.  Idempotent — safe to re-run.
--  Suggested tab name: loop_credit_cards
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS credit_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal','family')),
  name text NOT NULL,
  issuer text,
  network text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  pays_full boolean NOT NULL DEFAULT true,
  credit_limit numeric,
  manual_balance numeric,
  debt_id uuid REFERENCES debts(id) ON DELETE SET NULL,
  statement_day integer CHECK (statement_day BETWEEN 1 AND 31),
  due_day integer CHECK (due_day BETWEEN 1 AND 31),
  opened_note text,
  waiver_mode text NOT NULL DEFAULT 'none' CHECK (waiver_mode IN ('none','count','amount')),
  waiver_target numeric,
  waiver_progress numeric NOT NULL DEFAULT 0,
  waiver_period_note text,
  annual_fee numeric,
  annual_fee_note text,
  fee_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  installments jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Re-runnable equivalents of the jsonb defaults, for a table that already
-- exists from an earlier partial run.
ALTER TABLE public.credit_cards ALTER COLUMN fee_profile  SET DEFAULT '{}'::jsonb;
ALTER TABLE public.credit_cards ALTER COLUMN installments SET DEFAULT '[]'::jsonb;

-- The page's only query shape: every card in one scope, in display order.
CREATE INDEX IF NOT EXISTS credit_cards_user_scope_idx
  ON public.credit_cards (user_id, scope);

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;

-- Owner-only, all four verbs. Same shape as own_tax_profiles / own_debts —
-- these are the owner's own cards and there is no sharing story here.
-- DROP + CREATE (not DO $$) because that is how every policy in this repo is
-- written, and CREATE POLICY has no IF NOT EXISTS form.
DROP POLICY IF EXISTS "own_credit_cards" ON public.credit_cards;
CREATE POLICY "own_credit_cards" ON public.credit_cards
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- `updated_at` upkeep. public.set_updated_at() already exists (supabase/schema.sql
-- — it is what keeps public.trades honest); this is the SAME body verbatim, so
-- re-declaring it changes nothing and makes this file runnable on its own.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END; $$;

-- CREATE TRIGGER has no IF NOT EXISTS form, so the DROP makes the re-run safe.
DROP TRIGGER IF EXISTS credit_cards_updated_at ON public.credit_cards;
CREATE TRIGGER credit_cards_updated_at BEFORE UPDATE ON public.credit_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Check it landed ─────────────────────────────────────────────────────────
-- select count(*) as cards from public.credit_cards;

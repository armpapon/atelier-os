-- ============================================================================
--  Debt Tracker — รายการหนี้สินที่ผ่อนรายเดือน + payment log + forecast
--  Run in: Supabase Dashboard → Database → SQL Editor → New query
-- ============================================================================

-- 1. DEBTS — รายการหนี้สินที่ต้องผ่อนรายเดือน
CREATE TABLE IF NOT EXISTS public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,                        -- 'BMW Leasing', 'KTC บัตรเครดิต'
  creditor text,                             -- ผู้รับชำระ (matching transaction.title)
  monthly_payment numeric NOT NULL,          -- จำนวนต่อเดือน (บาท)
  due_day int NOT NULL DEFAULT 5 CHECK (due_day BETWEEN 1 AND 31),
  start_date date,                           -- เริ่มผ่อน
  end_date date,                             -- กำหนดผ่อนหมด
  total_months int,                          -- งวดทั้งหมด (เช่น 60)
  months_paid int DEFAULT 0,                 -- จ่ายไปแล้วกี่งวด (auto-updated)
  remaining_balance numeric,                 -- ยอดคงเหลือ (optional)
  interest_rate numeric,                     -- ดอกเบี้ย ต่อปี % (optional)
  type text DEFAULT 'loan' CHECK (type IN ('loan','credit_card','mortgage','lease','installment','other')),
  scope text DEFAULT 'personal' CHECK (scope IN ('personal','family')),
  tone text DEFAULT 'rose',                  -- color tag
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS debts_user_scope_idx ON public.debts(user_id, scope, is_active);

-- 2. DEBT_PAYMENTS — บันทึกการจ่ายแต่ละเดือน
CREATE TABLE IF NOT EXISTS public.debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  debt_id uuid NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  pay_month date NOT NULL,                   -- '2026-05-01' = งวดเดือน พ.ค. 2569
  amount_paid numeric NOT NULL,
  paid_at timestamptz DEFAULT now(),
  notes text,
  UNIQUE (debt_id, pay_month)                -- 1 งวด/เดือน/หนี้
);
CREATE INDEX IF NOT EXISTS debt_payments_debt_idx  ON public.debt_payments(debt_id, pay_month DESC);
CREATE INDEX IF NOT EXISTS debt_payments_month_idx ON public.debt_payments(user_id, pay_month);

-- RLS
ALTER TABLE public.debts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_debts"          ON public.debts;
DROP POLICY IF EXISTS "own_debt_payments"  ON public.debt_payments;

CREATE POLICY "own_debts"          ON public.debts         FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_debt_payments"  ON public.debt_payments FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

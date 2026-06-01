-- ============================================================================
--  Recurring Expenses + Emergency Fund flag
--  Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================================

-- 1. Recurring expenses (subscriptions, bills, ค่าน้ำไฟ ฯลฯ)
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,                    -- 'Netflix', 'AIS', 'การไฟฟ้านครหลวง'
  vendor text,                           -- pattern matching transaction title
  amount numeric NOT NULL,
  frequency text DEFAULT 'monthly' CHECK (frequency IN ('weekly','monthly','quarterly','yearly')),
  due_day int DEFAULT 5 CHECK (due_day BETWEEN 1 AND 31),
  category text,                         -- 'streaming', 'utility', 'internet', etc.
  scope text DEFAULT 'personal' CHECK (scope IN ('personal','family')),
  tone text DEFAULT 'amber',
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recurring_user_scope_idx ON public.recurring_expenses(user_id, scope, is_active);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_recurring" ON public.recurring_expenses;
CREATE POLICY "own_recurring" ON public.recurring_expenses
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2. Emergency Fund flag on accounts
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_emergency_fund boolean DEFAULT false;

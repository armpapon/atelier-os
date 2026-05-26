-- ============================================================================
--  Migration: Add scope (personal / family) to all finance tables
--  Run in: Supabase Dashboard → Database → SQL Editor → New query
-- ============================================================================

-- accounts
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS scope text DEFAULT 'personal'
  CHECK (scope IN ('personal', 'family'));

-- transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS scope text DEFAULT 'personal'
  CHECK (scope IN ('personal', 'family'));

-- budgets  ← ตัวนี้ทำให้เกิด error "column budgets.scope does not exist"
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS scope text DEFAULT 'personal'
  CHECK (scope IN ('personal', 'family'));

-- financial_goals
ALTER TABLE public.financial_goals
  ADD COLUMN IF NOT EXISTS scope text DEFAULT 'personal'
  CHECK (scope IN ('personal', 'family'));

-- Indexes
CREATE INDEX IF NOT EXISTS accounts_scope_idx     ON public.accounts(user_id, scope);
CREATE INDEX IF NOT EXISTS transactions_scope_idx ON public.transactions(user_id, scope, occurred_at DESC);
CREATE INDEX IF NOT EXISTS budgets_scope_idx      ON public.budgets(user_id, scope);

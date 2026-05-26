-- ============================================================================
--  Migration: Add scope (personal / family) to accounts & transactions
--  Run in: Supabase Dashboard → Database → SQL Editor → New query
-- ============================================================================

-- accounts: personal (กระเป๋าส่วนตัว) vs family (กระเป๋าครอบครัว)
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS scope text DEFAULT 'personal'
  CHECK (scope IN ('personal', 'family'));

-- transactions: ตามบัญชี หรือ override แยกได้
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS scope text DEFAULT 'personal'
  CHECK (scope IN ('personal', 'family'));

-- index สำหรับ filter เร็ว
CREATE INDEX IF NOT EXISTS accounts_scope_idx ON public.accounts(user_id, scope);
CREATE INDEX IF NOT EXISTS transactions_scope_idx ON public.transactions(user_id, scope, occurred_at DESC);

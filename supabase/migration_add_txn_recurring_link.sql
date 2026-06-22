-- ============================================================================
--  Link a transaction to a recurring bill (mark that bill paid this month)
--  Run in: Supabase Dashboard → Database → SQL Editor → New query
--  Idempotent — safe to re-run.
-- ============================================================================

alter table public.transactions
  add column if not exists recurring_id uuid references public.recurring_expenses(id) on delete set null;

create index if not exists transactions_recurring_idx on public.transactions(recurring_id);

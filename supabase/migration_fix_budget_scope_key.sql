-- ============================================================================
--  Migration: budgets unique key must include scope (audit blocker #8)
--
--  Problem: budgets is unique on (user_id, category, month) but the app has
--  personal + family scopes on the same categories. Upserting a family
--  budget for a category+month that already has a personal budget would
--  overwrite it (latent — no UI writes budgets yet, closed preemptively).
--
--  Idempotent: guarded drop + IF NOT EXISTS. Safe to re-run.
--
--  Suggested tab name: loop_budget_scope_key
-- ============================================================================

-- Make sure scope exists even if migration_add_scope.sql was skipped.
alter table public.budgets
  add column if not exists scope text default 'personal';

-- Drop the old scope-less unique constraint (default name from schema.sql).
alter table public.budgets
  drop constraint if exists budgets_user_id_category_month_key;

-- New key: one budget per user + scope + category + month.
create unique index if not exists budgets_user_scope_category_month_key
  on public.budgets (user_id, scope, category, month);

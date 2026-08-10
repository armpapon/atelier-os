-- ============================================================================
--  Migration: safe account lifecycle (audit blocker #3)
--
--  (1) Archive instead of hard delete.
--      `accounts.is_active` already exists and every reader filters on it
--      (listAccounts .eq('is_active', true)), so it IS the archive flag —
--      no second boolean needed. This migration only backfills any NULLs
--      and pins the default so archiving is reliable.
--
--  (2) Balance anchor for honest displayed balances.
--      `balance` alone is a snapshot that goes stale the moment a manual
--      transaction is logged. `balance_anchor_at` records WHEN the user set
--      the balance; the app then displays
--          balance + SUM(ledger transactions after the anchor)
--      Accounts without an anchor keep the old snapshot behaviour.
--
--  Idempotent: IF NOT EXISTS / no-op updates. Safe to re-run.
--  The app degrades gracefully if this has not been run yet.
--
--  Suggested tab name: loop_account_archive_anchor
-- ============================================================================

alter table public.accounts
  add column if not exists balance_anchor_at timestamptz;

update public.accounts set is_active = true where is_active is null;

alter table public.accounts
  alter column is_active set default true;

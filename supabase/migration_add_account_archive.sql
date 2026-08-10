-- ============================================================================
--  Migration: safe account lifecycle (audit blocker #3)
--  v2 (audit round 2): adds the balance-anchor BACKFILL for legacy accounts.
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
--
--      ANCHOR SEMANTICS (deliberate, documented): the anchor is a statement
--      of truth — "the real balance WAS this value AT this moment". A
--      backdated transaction entered later, dated BEFORE the anchor, must
--      NOT change the displayed balance: that money was already gone/there
--      when the user read the real balance off their bank app. Only ledger
--      rows dated AFTER the anchor move the display.
--
--  (3) v2 backfill: legacy accounts that existed before this migration have
--      no anchor, so their display would stay a stale snapshot forever.
--      Backfill anchor = updated_at (closest recorded moment the stored
--      balance was true; created_at / now() as fallbacks). Only rows with a
--      NULL anchor are touched, so re-running never clobbers a real anchor.
--
--  Idempotent: IF NOT EXISTS / NULL-guarded updates. Safe to re-run.
--  The app degrades gracefully if this has not been run yet.
--
--  Suggested tab name: loop_account_archive_anchor
-- ============================================================================

alter table public.accounts
  add column if not exists balance_anchor_at timestamptz;

update public.accounts set is_active = true where is_active is null;

alter table public.accounts
  alter column is_active set default true;

-- v2: anchor backfill for never-anchored legacy accounts (NULL-guarded).
update public.accounts
   set balance_anchor_at = coalesce(updated_at, created_at, now())
 where balance_anchor_at is null;

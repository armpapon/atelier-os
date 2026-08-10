-- ============================================================================
--  Migration: safe account lifecycle (audit blocker #3)
--  v3 (audit round 3): backfill = now() (not updated_at) + DB-layer trigger
--  that stamps the anchor on ANY balance write, forever.
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
--      NOT change the displayed balance. Only ledger rows dated AFTER the
--      anchor move the display.
--
--  (3) v3 backfill: never-anchored accounts get anchor = now(). This gives
--      exact display continuity — Σ(after now) = 0, so the shown balance
--      equals the stored snapshot, which is what users saw pre-anchor. The
--      v2 backfill used updated_at, which nothing guarantees tracks balance
--      writes (a stale updated_at re-adds the whole ledger on top of a
--      current snapshot). If v2 already ran, ALSO run the one-shot
--      migration_reconcile_anchor_v416.sql to reset those anchors.
--
--  (4) v3 trigger — the durable invariant: any UPDATE that changes balance
--      WITHOUT explicitly setting balance_anchor_at gets stamped now() at
--      the DB layer. App code can never forget again; explicit stamps
--      (e.g. CSV import setting anchor = statement date) are respected.
--
--  Idempotent: IF NOT EXISTS / NULL-guarded update / CREATE OR REPLACE /
--  DROP TRIGGER IF EXISTS. Safe to re-run.
--  The app degrades gracefully if this has not been run yet.
--
--  Suggested tab name: loop_account_archive_anchor
-- ============================================================================

alter table public.accounts
  add column if not exists balance_anchor_at timestamptz;

update public.accounts set is_active = true where is_active is null;

alter table public.accounts
  alter column is_active set default true;

-- v3: anchor backfill — snapshot-is-truth-now, display continuity guaranteed.
update public.accounts
   set balance_anchor_at = now()
 where balance_anchor_at is null;

-- v3: DB-layer invariant — every balance write stamps the anchor unless the
-- writer stamped it explicitly in the same UPDATE.
create or replace function public.touch_account_anchor()
returns trigger
language plpgsql
as $$
begin
  if (new.balance is distinct from old.balance)
     and (new.balance_anchor_at is not distinct from old.balance_anchor_at) then
    new.balance_anchor_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_account_anchor on public.accounts;
create trigger trg_touch_account_anchor
  before update on public.accounts
  for each row
  execute function public.touch_account_anchor();

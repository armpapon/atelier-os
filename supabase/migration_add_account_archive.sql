-- ============================================================================
--  Migration: safe account lifecycle (audit blocker #3)
--  v4 (audit round 4): PROVENANCE — balance_anchor_source tells an audit
--  which kind of writer last attested the balance.
--
--  (1) Archive instead of hard delete.
--      `accounts.is_active` already exists and every reader filters on it
--      (listAccounts .eq('is_active', true)), so it IS the archive flag —
--      no second boolean needed. This migration only backfills any NULLs
--      and pins the default so archiving is reliable.
--
--  (2) Balance anchor for honest displayed balances.
--      `balance_anchor_at` records WHEN the stored balance was true; the
--      app displays balance + SUM(ledger transactions after the anchor).
--      Backdated rows before the anchor never move the display (accepted
--      semantics, round 2/3).
--
--  (3) v4 provenance: balance_anchor_source ∈
--        'user'      — human typed the real balance (set-balance modal,
--                      account creation) — highest trust
--        'import'    — CP Bal from a CSV statement (anchored at the file's
--                      last transaction)
--        'trigger'   — the DB trigger stamped a balance write that forgot
--                      to stamp explicitly
--        'backfill'  — this migration's NULL-anchor backfill
--        'reconcile' — migration_reconcile_anchor_v416.sql
--      Every app write path stamps its source; the audit query
--      (audit_account_balances.sql) surfaces it per account.
--
--  (4) Backfill (v3 semantics kept): never-anchored accounts get
--      anchor = now(), source = 'backfill' — Σ(after now) = 0, so the shown
--      balance equals the stored snapshot exactly. NULL-only guard.
--
--  (5) Trigger (v3, extended): any UPDATE that changes balance WITHOUT
--      explicitly moving balance_anchor_at gets anchor = now() AND
--      source = 'trigger' at the DB layer — the durable invariant.
--
--  Idempotent: IF NOT EXISTS / NULL-guarded updates / CREATE OR REPLACE /
--  DROP TRIGGER IF EXISTS. Safe to re-run.
--  The app degrades gracefully if this has not been run yet.
--
--  Suggested tab name: loop_account_archive_anchor
-- ============================================================================

alter table public.accounts
  add column if not exists balance_anchor_at timestamptz;

alter table public.accounts
  add column if not exists balance_anchor_source text;

update public.accounts set is_active = true where is_active is null;

alter table public.accounts
  alter column is_active set default true;

-- Backfill for never-anchored accounts (NULL-only; display continuity).
update public.accounts
   set balance_anchor_at = now(),
       balance_anchor_source = 'backfill'
 where balance_anchor_at is null;

-- Provenance backfill for anchors that predate the source column.
update public.accounts
   set balance_anchor_source = 'backfill'
 where balance_anchor_source is null;

-- DB-layer invariant — every balance write stamps anchor + source unless the
-- writer stamped the anchor explicitly in the same UPDATE.
create or replace function public.touch_account_anchor()
returns trigger
language plpgsql
as $$
begin
  if (new.balance is distinct from old.balance)
     and (new.balance_anchor_at is not distinct from old.balance_anchor_at) then
    new.balance_anchor_at := now();
    new.balance_anchor_source := 'trigger';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_account_anchor on public.accounts;
create trigger trg_touch_account_anchor
  before update on public.accounts
  for each row
  execute function public.touch_account_anchor();

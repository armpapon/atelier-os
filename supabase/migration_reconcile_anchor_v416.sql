-- ============================================================================
--  ONE-SHOT RECONCILIATION (audit round 3, v4.16) — run ONCE after v4.16
--
--  WHY: the v4.15 backfill set balance_anchor_at = updated_at, but nothing
--  guarantees updated_at tracks BALANCE writes — an account whose updated_at
--  is near its creation time would get its entire ledger re-added on top of
--  a current snapshot (double count). Since the v2 migration already ran in
--  production, existing anchors are updated_at-based and must be reset.
--
--  WHY THIS IS SAFE: setting anchor = now() declares "the stored balance is
--  the truth RIGHT NOW". Σ(transactions after now) = 0, so the displayed
--  balance becomes exactly the stored snapshot — precisely what the app
--  showed before v4.15 introduced anchors. No double count is possible, and
--  every future balance write re-stamps the anchor correctly (app code +
--  the touch_account_anchor DB trigger from migration_add_account_archive
--  v3).
--
--  Idempotent by nature: re-running just re-declares "snapshot is truth
--  now", which is always a safe statement.
--
--  Suggested tab name: loop_reconcile_anchor_v416
-- ============================================================================

update public.accounts
   set balance_anchor_at = now();

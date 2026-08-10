-- ============================================================================
--  RECONCILIATION v2 (audit round 4) — MATERIALIZE, don't discard.
--  Run AFTER migration_add_account_archive.sql v4.
--
--  v1 of this file blindly set anchor = now(), which DISCARDED any
--  un-materialized post-anchor ledger delta: a valid anchor 50,000@T0 with
--  a later −1,000 expense displayed 49,000, but the blind reset put the
--  display back to 50,000 (silently gained 1,000), and every re-run
--  re-absorbed new deltas. The auditor's counterexample was correct.
--
--  v2 MATERIALIZES the displayed value first:
--      balance := balance + Σ(ledger after current anchor)   -- the exact
--                 formula the app displays (applyEffectiveBalances:
--                 all transactions of the account dated after the anchor)
--      balance_anchor_at := now()
--      balance_anchor_source := 'reconcile'
--  So the DISPLAYED value is preserved bit-for-bit (49,000 stays 49,000),
--  and the operation is TRULY idempotent: a second run adds
--  Σ(after now) = 0 and changes nothing.
--
--  HONEST LIMIT: this cannot repair an anchor that was WRONG to begin with
--  (e.g. the v4.15 updated_at backfill double-count) — SQL cannot know
--  whether a given stored balance was ever true. That is resolved by the
--  one-time human audit: run audit_account_balances.sql, compare each
--  effective balance against the real bank app, and correct any wrong
--  account via the set-balance modal (stamps source='user').
--
--  Idempotent: yes, by construction (second run is a no-op on balances).
--
--  Suggested tab name: loop_reconcile_anchor_v416
-- ============================================================================

update public.accounts a
   set balance = a.balance + coalesce((
         select sum(t.amount)
         from public.transactions t
         where t.account_id = a.id
           and a.balance_anchor_at is not null
           and t.occurred_at > a.balance_anchor_at
       ), 0),
       balance_anchor_at = now(),
       balance_anchor_source = 'reconcile';

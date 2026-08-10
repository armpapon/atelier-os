-- ============================================================================
--  READ-ONLY audit: per-account balance provenance + effective display
--  (audit round 4 — the one-time human verification step)
--
--  Run in the Supabase SQL Editor, then compare `effective_displayed_balance`
--  for each account against the REAL number in the bank app:
--    · matches      → nothing to do
--    · doesn't match → open Loop → บัญชี & ทรัพย์สิน → ✎ → "ตั้งยอดปัจจุบัน"
--      and type the real number (stamps balance_anchor_source = 'user').
--
--  This resolves what SQL provably cannot: whether a given anchor was ever
--  a true statement of the account's balance.
--
--  Read-only — changes nothing. Safe to run any number of times.
--
--  Suggested tab name: loop_audit_account_balances
-- ============================================================================

select
  a.name,
  a.scope,
  a.is_active,
  a.balance                            as stored_balance,
  a.balance_anchor_at,
  a.balance_anchor_source,
  coalesce(s.delta, 0)                 as sum_after_anchor,
  a.balance + coalesce(s.delta, 0)     as effective_displayed_balance,
  coalesce(s.n, 0)                     as txn_count_after_anchor
from public.accounts a
left join lateral (
  select sum(t.amount) as delta, count(*) as n
  from public.transactions t
  where t.account_id = a.id
    and a.balance_anchor_at is not null
    and t.occurred_at > a.balance_anchor_at
) s on true
where a.user_id = (select id from auth.users where email = 'armpapon@gmail.com')
order by a.scope, a.is_active desc, a.name;

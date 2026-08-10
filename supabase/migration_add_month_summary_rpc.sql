-- ============================================================================
--  Migration: server-side month summary aggregate (audit blocker #5)
--
--  Problem: monthly totals are aggregated client-side from listTransactions /
--  listTransactionsRange, which PostgREST silently truncates at max-rows
--  (default 1000). A busy month or a 12-month range under-counts.
--
--  Fix: aggregate in SQL. Bangkok-bucketed (occurred_at AT TIME ZONE
--  'Asia/Bangkok'), transfer-excluded, RLS applies (SECURITY INVOKER).
--  The client uses this for the 12-month trend and the dashboard pulse,
--  and falls back to paginated client aggregation when this function is
--  not installed yet.
--
--  Idempotent: CREATE OR REPLACE. Safe to re-run.
--
--  Suggested tab name: loop_finance_month_summary_rpc
-- ============================================================================

create or replace function public.finance_month_summary(
  p_scope text,   -- 'personal' | 'family' | null = both
  p_from  text,   -- 'YYYY-MM' first month (inclusive)
  p_to    text    -- 'YYYY-MM' last month (inclusive)
) returns table (ym text, income numeric, expense numeric, count bigint)
language sql
security invoker
stable
set search_path = public
as $$
  select
    to_char(t.occurred_at at time zone 'Asia/Bangkok', 'YYYY-MM')      as ym,
    coalesce(sum(t.amount)  filter (where t.amount > 0), 0)            as income,
    coalesce(sum(-t.amount) filter (where t.amount < 0), 0)            as expense,
    count(*)                                                           as count
  from transactions t
  where t.user_id = auth.uid()
    and (p_scope is null or t.scope = p_scope)
    and t.type is distinct from 'transfer'
    and t.occurred_at >= (p_from || '-01 00:00:00+07:00')::timestamptz
    and t.occurred_at <  ((to_date(p_to || '-01', 'YYYY-MM-DD') + interval '1 month')::date::text
                          || ' 00:00:00+07:00')::timestamptz
  group by 1
  order by 1;
$$;

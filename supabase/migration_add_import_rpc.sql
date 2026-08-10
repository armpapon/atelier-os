-- ============================================================================
--  Migration: Atomic CSV import RPC (audit blocker #1)
--
--  Problem: the CSV importer wipes a month (DELETE) and bulk-inserts in two
--  separate PostgREST calls. A failure in between loses the month, and two
--  concurrent imports can double every row (client-side dedup races).
--
--  Fix: one SQL function = one transaction. A per-user, per-month advisory
--  lock serialises concurrent imports of the same month, and dedup runs
--  server-side UNDER that lock, so the race window is closed.
--
--  SECURITY INVOKER → RLS still applies to every statement inside.
--  Idempotent: CREATE OR REPLACE. Safe to re-run.
--
--  Suggested tab name: loop_import_transactions_rpc
-- ============================================================================

create or replace function public.import_transactions(
  p_scope text,                 -- 'personal' | 'family' (all rows in the batch)
  p_month text,                 -- 'YYYY-MM' (Bangkok calendar month of the batch)
  p_wipe  boolean,              -- true = delete this scope+month first
  p_rows  jsonb,                -- [{title, occurred_at, amount, category, type, note, account_id}]
  p_dedup boolean default true  -- skip rows already in the ledger (minute+amount+title)
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_start timestamptz;
  v_end   timestamptz;
  v_count int := 0;
begin
  if v_uid is null then
    raise exception 'Not logged in';
  end if;
  if p_month is null or p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'p_month must be YYYY-MM';
  end if;

  -- Serialise concurrent imports of the same user+month (released at commit).
  perform pg_advisory_xact_lock(hashtext(v_uid::text || p_month));

  -- Bangkok month bounds: [YYYY-MM-01 00:00+07, next month 00:00+07)
  v_start := (p_month || '-01 00:00:00+07:00')::timestamptz;
  v_end   := ((to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month')::date::text
              || ' 00:00:00+07:00')::timestamptz;

  if p_wipe then
    delete from transactions t
    where t.user_id = v_uid
      and t.scope = p_scope
      and t.occurred_at >= v_start
      and t.occurred_at <  v_end;
  end if;

  with incoming as (
    select
      r.title, r.occurred_at, r.amount, r.category, r.type, r.note, r.account_id
    from jsonb_to_recordset(p_rows) as r(
      title text, occurred_at timestamptz, amount numeric,
      category text, type text, note text, account_id uuid
    )
  ), ins as (
    insert into transactions (user_id, title, occurred_at, amount, category, type, note, account_id, scope)
    select v_uid, i.title, i.occurred_at, i.amount, i.category, i.type, i.note, i.account_id, p_scope
    from incoming i
    where p_wipe
       or not p_dedup
       or not exists (
            select 1 from transactions t
            where t.user_id = v_uid
              and t.scope = p_scope
              and t.occurred_at >= v_start and t.occurred_at < v_end
              and date_trunc('minute', t.occurred_at) = date_trunc('minute', i.occurred_at)
              and round(t.amount * 100) = round(i.amount * 100)
              and left(trim(t.title), 40) = left(trim(i.title), 40)
          )
    returning 1
  )
  select count(*) into v_count from ins;

  return v_count;
end;
$$;
